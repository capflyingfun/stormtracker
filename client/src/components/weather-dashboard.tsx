import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Thermometer, Droplets, Wind, Eye, Cloud,
  Gauge, ChevronDown, ChevronUp, RefreshCw, Sunrise, Sunset,
  Moon, AlertTriangle, Database, Shield
} from "lucide-react";
import { useState } from "react";

interface WeatherDashboardProps {
  lat: number;
  lon: number;
  useMetric: boolean;
  locationName: string;
}

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getConditionIcon(condition: string) {
  const c = condition.toLowerCase();
  if (c.includes('thunder') || c.includes('storm')) return '⛈️';
  if (c.includes('heavy rain') || c.includes('torrential')) return '🌧️';
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return '🌦️';
  if (c.includes('snow') || c.includes('blizzard') || c.includes('sleet')) return '❄️';
  if (c.includes('fog') || c.includes('mist') || c.includes('haze')) return '🌫️';
  if (c.includes('overcast') || c.includes('cloudy')) return '☁️';
  if (c.includes('partly') || c.includes('partly cloudy')) return '⛅';
  if (c.includes('clear') || c.includes('sunny')) return '☀️';
  return '🌤️';
}

function dualTempF(tempF: number, tempC: number) {
  return `${Math.round(tempF)}°F (${Math.round(tempC)}°C)`;
}

function dualWind(mph: number, kph: number) {
  return `${Math.round(mph)} mph (${Math.round(kph)} km/h)`;
}

function dualPrecip(inches: number, mm: number) {
  return `${inches.toFixed(2)} in (${mm.toFixed(1)} mm)`;
}

function dualVis(miles: number, km: number) {
  return `${miles.toFixed(1)} mi (${km.toFixed(1)} km)`;
}

function dualPressure(inHg: number, mb: number) {
  return `${inHg.toFixed(2)} inHg (${Math.round(mb)} mb)`;
}

function getUVLabel(uv: number) {
  if (uv <= 2) return { label: 'Low', color: 'text-green-400' };
  if (uv <= 5) return { label: 'Moderate', color: 'text-yellow-400' };
  if (uv <= 7) return { label: 'High', color: 'text-orange-400' };
  if (uv <= 10) return { label: 'Very High', color: 'text-red-400' };
  return { label: 'Extreme', color: 'text-purple-400' };
}

function getAQILabel(aqi: number) {
  if (aqi <= 1) return { label: 'Good', color: 'text-green-400' };
  if (aqi <= 2) return { label: 'Moderate', color: 'text-yellow-400' };
  if (aqi <= 3) return { label: 'Unhealthy (Sensitive)', color: 'text-orange-400' };
  if (aqi <= 4) return { label: 'Unhealthy', color: 'text-red-400' };
  return { label: 'Hazardous', color: 'text-purple-400' };
}

function getSourceColor(name: string) {
  if (name === 'NWS') return 'text-blue-300 border-blue-500/40';
  if (name === 'OpenWeather') return 'text-orange-300 border-orange-500/40';
  if (name === 'WeatherAPI') return 'text-green-300 border-green-500/40';
  return 'text-cyan-300 border-cyan-500/40';
}

function getHazardColor(hazard: string) {
  if (hazard.includes('tornado') || hazard.includes('hurricane')) return 'bg-red-600 text-white';
  if (hazard.includes('thunderstorm') || hazard.includes('severe')) return 'bg-orange-600 text-white';
  if (hazard.includes('flood') || hazard.includes('blizzard')) return 'bg-red-500 text-white';
  if (hazard.includes('wind') || hazard.includes('heat') || hazard.includes('fire')) return 'bg-amber-600 text-white';
  if (hazard.includes('freeze') || hazard.includes('frost') || hazard.includes('cold') || hazard.includes('ice') || hazard.includes('winter')) return 'bg-blue-600 text-white';
  if (hazard.includes('fog')) return 'bg-slate-500 text-white';
  return 'bg-yellow-600 text-white';
}

function NWSPeriodCard({ period }: { period: any }) {
  const [showDetail, setShowDetail] = useState(false);
  const isNight = !period.isDaytime;
  const tempLabel = isNight ? 'Low' : 'High';

  return (
    <div className={`rounded-xl p-3 border ${
      period.hasAdvisory
        ? 'bg-amber-900/20 border-amber-600/40'
        : isNight
          ? 'bg-slate-800/60 border-slate-600/40'
          : 'bg-slate-700/30 border-slate-600/40'
    }`}>
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-xl shrink-0">{getConditionIcon(period.shortForecast)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-white font-semibold text-sm">{period.name}</span>
            {period.hasAdvisory && (
              <Badge className="bg-amber-600 text-white text-[9px] px-1.5 py-0 h-4 uppercase font-bold">Advisory</Badge>
            )}
            <span className="text-[11px] text-slate-400">
              {isNight ? '🌙' : '☀️'} {tempLabel}: {period.temperature_f}°F ({period.temperature_c}°C)
            </span>
          </div>
          <p className="text-slate-300 text-xs mt-0.5">{period.shortForecast}</p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 flex-wrap">
            <span>Wind: {period.windSpeed} {period.windDirection}</span>
            {period.precipChance > 0 && (
              <span className="text-blue-400">💧 {period.precipChance}%</span>
            )}
          </div>
          {period.weatherTags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {[...new Set(period.weatherTags)].map((h: string, i: number) => (
                <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${getHazardColor(h)}`}>
                  {h.charAt(0).toUpperCase() + h.slice(1)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {period.detailedForecast && (
        <>
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors mt-1"
          >
            {showDetail ? 'Hide details' : 'Show details...'}
          </button>
          {showDetail && (
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              {period.detailedForecast}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function NWSAlertCard({ alert }: { alert: any }) {
  const [showDetail, setShowDetail] = useState(false);
  const severityColors: Record<string, string> = {
    'Extreme': 'bg-red-900/40 border-red-500',
    'Severe': 'bg-red-900/30 border-red-600/50',
    'Moderate': 'bg-orange-900/30 border-orange-600/50',
    'Minor': 'bg-yellow-900/30 border-yellow-600/50',
  };
  const bgClass = severityColors[alert.severity] || 'bg-amber-900/20 border-amber-600/40';

  return (
    <div className={`rounded-xl p-3 border ${bgClass}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-amber-200 font-semibold text-sm">{alert.event}</span>
            {alert.severity && (
              <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-400 px-1.5 py-0 h-4">
                {alert.severity}
              </Badge>
            )}
          </div>
          {alert.senderName && (
            <p className="text-[11px] text-slate-400 mb-1">by {alert.senderName}</p>
          )}
          {alert.expires && (
            <p className="text-[10px] text-slate-500 mb-1">
              Expires: {new Date(alert.expires).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
          {alert.areaDesc && (
            <p className="text-[10px] text-slate-500 mb-1">Areas: {alert.areaDesc}</p>
          )}
          {alert.instruction && (
            <div className="bg-amber-900/20 rounded-lg p-2 mt-1.5 border border-amber-700/30">
              <p className="text-[10px] text-amber-300 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <span><strong>Safety Instructions:</strong> {alert.instruction.substring(0, 300)}{alert.instruction.length > 300 ? '...' : ''}</span>
              </p>
            </div>
          )}
          {alert.description && (
            <>
              <button
                onClick={() => setShowDetail(!showDetail)}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors mt-1"
              >
                {showDetail ? 'Hide details' : 'Full description...'}
              </button>
              {showDetail && (
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed whitespace-pre-line">{alert.description}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WeatherDashboard({ lat, lon, useMetric, locationName }: WeatherDashboardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const { data: minuteCast } = useQuery({
    queryKey: ['/api/accuweather/minutecast', lat, lon],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/accuweather/minutecast?lat=${lat}&lon=${lon}`);
      return res.json();
    },
    enabled: Number.isFinite(lat) && Number.isFinite(lon),
    staleTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['/api/weather-forecast', lat, lon],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/weather-forecast?lat=${lat}&lon=${lon}`);
      return res.json();
    },
    enabled: Number.isFinite(lat) && Number.isFinite(lon),
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    retry: 3,
  });

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600 mb-4 sm:mb-6">
        <CardContent className="p-3 sm:p-4">
          <div className="space-y-3">
            <div className="h-6 bg-slate-700 rounded animate-pulse w-40" />
            <div className="grid grid-cols-2 gap-2">
              {[1,2,3,4].map(i => <div key={i} className="h-14 bg-slate-700 rounded animate-pulse" />)}
            </div>
            <div className="h-20 bg-slate-700 rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.current) {
    return (
      <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600 mb-4 sm:mb-6">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-400">
              <Cloud className="w-5 h-5" />
              <span className="text-sm">Weather data unavailable</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-slate-400">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const cur = data.current;
  const forecast = data.forecast || [];
  const alerts = data.alerts || [];
  const nwsPeriods = data.nws_periods || [];
  const nwsAlerts = data.nws_alerts || [];
  const airQuality = data.air_quality;
  const sourcesDetail = data.sources_detail || [];
  const sourcesCount = data.sources_count || 1;

  return (
    <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600 mb-4 sm:mb-6 overflow-hidden">
      <CardHeader className="pb-2 px-3 sm:px-6">
        <CardTitle className="text-white cursor-pointer flex items-center justify-between gap-2" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl shrink-0">{getConditionIcon(cur.condition)}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-lg sm:text-2xl font-bold whitespace-nowrap">
                  {dualTempF(cur.temp_f, cur.temp_c)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-xs sm:text-sm text-slate-300">{cur.condition}</p>
                <span className="text-[10px] sm:text-xs text-slate-500 whitespace-nowrap">
                  Feels {dualTempF(cur.feelslike_f, cur.feelslike_c)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant="outline" className="text-[9px] border-slate-600 text-slate-400 hidden sm:flex px-1.5 h-5">
              {sourcesCount} source{sourcesCount !== 1 ? 's' : ''}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white"
              onClick={(e) => { e.stopPropagation(); refetch(); }}
              disabled={isFetching}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 space-y-3 px-3 sm:px-6">
        {minuteCast?.Summary?.Phrase && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-700/40 border border-slate-600/40">
            <span className="text-sm">🕐</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200">
                MinuteCast™: <span className={minuteCast.Summary.TypeId === 0 ? 'text-green-400' : 'text-amber-400'}>{minuteCast.Summary.Phrase}</span>
              </p>
            </div>
            <Badge variant="outline" className="text-[8px] border-slate-600 text-slate-500 px-1 h-4 shrink-0">AccuWeather</Badge>
          </div>
        )}
        {nwsAlerts.length > 0 && (
          <div className="space-y-2">
            {nwsAlerts.map((alert: any, i: number) => (
              <NWSAlertCard key={i} alert={alert} />
            ))}
          </div>
        )}

        {alerts.length > 0 && nwsAlerts.length === 0 && (
          <div className="space-y-1.5">
            {alerts.slice(0, 3).map((alert: any, i: number) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-red-900/30 border border-red-700/50 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-red-300">{alert.event || alert.headline}</p>
                  {alert.description && <p className="text-xs text-red-400/80 line-clamp-2">{alert.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="bg-slate-700/30 rounded-lg p-2 text-center">
            <Droplets className="w-3.5 h-3.5 mx-auto text-blue-400 mb-0.5" />
            <div className="text-white font-semibold text-sm">{cur.humidity}%</div>
            <div className="text-slate-400 text-[10px]">Humidity</div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-2 text-center">
            <Wind className="w-3.5 h-3.5 mx-auto text-cyan-400 mb-0.5" />
            <div className="text-white font-semibold text-[11px] leading-tight">{dualWind(cur.wind_mph, cur.wind_kph)}</div>
            <div className="text-slate-400 text-[10px]">{cur.wind_dir} ({cur.wind_degree}°){cur.gust_mph > cur.wind_mph + 5 ? ` G${Math.round(cur.gust_mph)}` : ''}</div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-2 text-center">
            <Gauge className="w-3.5 h-3.5 mx-auto text-purple-400 mb-0.5" />
            <div className="text-white font-semibold text-[11px] leading-tight">{dualPressure(cur.pressure_in, cur.pressure_mb)}</div>
            <div className="text-slate-400 text-[10px]">Pressure</div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-2 text-center">
            <Eye className="w-3.5 h-3.5 mx-auto text-green-400 mb-0.5" />
            <div className="text-white font-semibold text-[11px] leading-tight">{dualVis(cur.visibility_miles, cur.visibility_km)}</div>
            <div className="text-slate-400 text-[10px]">Visibility</div>
          </div>
          {cur.dew_point_f != null && (
            <div className="bg-slate-700/30 rounded-lg p-2 text-center">
              <Thermometer className="w-3.5 h-3.5 mx-auto text-teal-400 mb-0.5" />
              <div className="text-white font-semibold text-[11px] leading-tight">{dualTempF(cur.dew_point_f, cur.dew_point_c)}</div>
              <div className="text-slate-400 text-[10px]">Dew Point</div>
            </div>
          )}
          <div className="bg-slate-700/30 rounded-lg p-2 text-center">
            <Cloud className="w-3.5 h-3.5 mx-auto text-slate-300 mb-0.5" />
            <div className="text-white font-semibold text-sm">{cur.cloud}%</div>
            <div className="text-slate-400 text-[10px]">Cloud Cover</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
          {cur.uv !== undefined && cur.uv > 0 && (
            <span>UV: <span className={getUVLabel(cur.uv).color}>{cur.uv} ({getUVLabel(cur.uv).label})</span></span>
          )}
          {airQuality?.us_epa_index && (
            <span>AQI: <span className={getAQILabel(airQuality.us_epa_index).color}>{getAQILabel(airQuality.us_epa_index).label}</span></span>
          )}
          {cur.precip_in > 0 && (
            <span>Precip: {dualPrecip(cur.precip_in, cur.precip_mm)}</span>
          )}
        </div>

        {sourcesDetail.length > 1 && (
          <div>
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Database className="w-3 h-3" />
              <span>Hybrid: {sourcesDetail.map((s: any) => s.name).join(' + ')}</span>
              {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showSources && (
              <div className="mt-2 space-y-1.5">
                <div className="text-[9px] text-slate-500 mb-1">Per-source readings (consensus averaged above):</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {sourcesDetail.map((src: any, i: number) => (
                    <div key={i} className={`bg-slate-700/20 rounded p-2 border ${getSourceColor(src.name)}`}>
                      <div className="text-[10px] font-semibold mb-1">{src.name}</div>
                      <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-300">
                        <span>Temp: {Math.round(src.temp_f)}°F ({Math.round(src.temp_c)}°C)</span>
                        <span>Humidity: {src.humidity}%</span>
                        <span>Wind: {Math.round(src.wind_mph)} mph</span>
                        <span>Press: {Math.round(src.pressure_mb)} mb</span>
                        <span className="col-span-2 text-slate-400 truncate">{src.condition}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {nwsPeriods.length > 0 && (
          <>
            <Separator className="bg-slate-700" />
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Shield className="w-3 h-3" />
                NWS Forecast Periods
              </h4>
              <div className="space-y-2">
                {nwsPeriods.map((period: any, i: number) => (
                  <NWSPeriodCard key={i} period={period} />
                ))}
              </div>
            </div>
          </>
        )}

        {forecast.length > 0 && (
          <>
            <Separator className="bg-slate-700" />
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {forecast.length}-Day Forecast
              </h4>
              <div className="space-y-0.5">
                {forecast.map((day: any, i: number) => {
                  const d = new Date(day.date + 'T12:00:00');
                  const dayName = i === 0 ? 'Today' : DAY_NAMES[d.getDay()];
                  return (
                    <div key={i} className="flex items-center gap-1.5 py-1.5 text-sm">
                      <span className="text-slate-300 w-9 text-[11px] font-medium shrink-0">{dayName}</span>
                      <span className="text-base shrink-0">{getConditionIcon(day.day.condition)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-white font-semibold text-[11px]">
                            {Math.round(day.day.maxtemp_f)}°
                          </span>
                          <span className="text-slate-500 text-[10px]">/</span>
                          <span className="text-slate-400 text-[11px]">
                            {Math.round(day.day.mintemp_f)}°F
                          </span>
                          <span className="text-slate-600 text-[9px]">
                            ({Math.round(day.day.maxtemp_c)}°/{Math.round(day.day.mintemp_c)}°C)
                          </span>
                        </div>
                      </div>
                      {day.day.daily_chance_of_rain > 0 && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Droplets className="w-3 h-3 text-blue-400" />
                          <span className="text-blue-400 text-[10px]">{day.day.daily_chance_of_rain}%</span>
                        </div>
                      )}
                      <span className="text-slate-500 text-[9px] shrink-0 hidden sm:block">
                        {Math.round(day.day.maxwind_mph)}mph
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {expanded && forecast.length > 0 && (
          <>
            <Separator className="bg-slate-700" />
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Sunrise & Sunset</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-slate-700/30 rounded-lg p-2 flex items-center gap-2">
                  <Sunrise className="w-4 h-4 text-orange-400 shrink-0" />
                  <span className="text-slate-300 text-xs">{forecast[0]?.astro?.sunrise}</span>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-2 flex items-center gap-2">
                  <Sunset className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="text-slate-300 text-xs">{forecast[0]?.astro?.sunset}</span>
                </div>
                {forecast[0]?.astro?.moon_phase && (
                  <div className="bg-slate-700/30 rounded-lg p-2 flex items-center gap-2">
                    <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-slate-300 text-xs truncate">{forecast[0]?.astro?.moon_phase}</span>
                  </div>
                )}
                {forecast[0]?.astro?.moon_illumination && (
                  <div className="bg-slate-700/30 rounded-lg p-2 flex items-center gap-2">
                    <span className="text-indigo-400 text-xs shrink-0">🌙</span>
                    <span className="text-slate-300 text-xs">{forecast[0]?.astro?.moon_illumination}% lit</span>
                  </div>
                )}
              </div>
            </div>

            {airQuality && (
              <>
                <Separator className="bg-slate-700" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Air Quality</h4>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {airQuality.pm2_5 !== undefined && (
                      <div className="bg-slate-700/30 rounded p-2 text-center">
                        <div className="text-white font-semibold">{airQuality.pm2_5?.toFixed(1)}</div>
                        <div className="text-slate-400 text-[10px]">PM2.5</div>
                      </div>
                    )}
                    {airQuality.pm10 !== undefined && (
                      <div className="bg-slate-700/30 rounded p-2 text-center">
                        <div className="text-white font-semibold">{airQuality.pm10?.toFixed(1)}</div>
                        <div className="text-slate-400 text-[10px]">PM10</div>
                      </div>
                    )}
                    {airQuality.o3 !== undefined && (
                      <div className="bg-slate-700/30 rounded p-2 text-center">
                        <div className="text-white font-semibold">{airQuality.o3?.toFixed(1)}</div>
                        <div className="text-slate-400 text-[10px]">Ozone</div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="w-full text-slate-400 hover:text-white hover:bg-slate-700/50 text-xs"
        >
          {expanded ? 'Show Less' : 'Sunrise/Sunset, Air Quality...'}
          {expanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
        </Button>

        <div className="text-[9px] text-slate-500 text-right">
          Sources: {data.source || 'Weather API'} (Hybrid Averaged)
        </div>
      </CardContent>
    </Card>
  );
}
