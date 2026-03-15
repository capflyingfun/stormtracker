import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Thermometer, Droplets, Wind, Eye, Sun, Cloud, CloudRain,
  Gauge, ChevronDown, ChevronUp, RefreshCw, Sunrise, Sunset,
  Moon, AlertTriangle
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

function dualTemp(tempF: number, tempC: number, useMetric: boolean) {
  if (useMetric) return `${Math.round(tempC)}°C (${Math.round(tempF)}°F)`;
  return `${Math.round(tempF)}°F (${Math.round(tempC)}°C)`;
}

function dualWind(mph: number, kph: number, useMetric: boolean) {
  if (useMetric) return `${Math.round(kph)} km/h`;
  return `${Math.round(mph)} mph`;
}

function dualPrecip(inches: number, mm: number, useMetric: boolean) {
  if (useMetric) return `${mm.toFixed(1)} mm`;
  return `${inches.toFixed(2)} in`;
}

function dualVis(miles: number, km: number, useMetric: boolean) {
  if (useMetric) return `${km.toFixed(1)} km`;
  return `${miles.toFixed(1)} mi`;
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

export default function WeatherDashboard({ lat, lon, useMetric, locationName }: WeatherDashboardProps) {
  const [expanded, setExpanded] = useState(false);

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
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="h-6 bg-slate-700 rounded animate-pulse w-40" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="h-16 bg-slate-700 rounded animate-pulse" />)}
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
        <CardContent className="p-4">
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
  const airQuality = data.air_quality;

  return (
    <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600 mb-4 sm:mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-white cursor-pointer flex items-center justify-between" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getConditionIcon(cur.condition)}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl font-bold">
                  {useMetric ? `${Math.round(cur.temp_c)}°C` : `${Math.round(cur.temp_f)}°F`}
                </span>
                <span className="text-sm text-slate-400">
                  Feels {useMetric ? `${Math.round(cur.feelslike_c)}°C` : `${Math.round(cur.feelslike_f)}°F`}
                </span>
              </div>
              <p className="text-sm text-slate-300">{cur.condition}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

      <CardContent className="pt-0 space-y-3">
        {alerts.length > 0 && (
          <div className="space-y-1.5">
            {alerts.slice(0, 3).map((alert: any, i: number) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-red-900/30 border border-red-700/50 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-300">{alert.event || alert.headline}</p>
                  {alert.description && <p className="text-xs text-red-400/80 line-clamp-2">{alert.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-slate-700/30 rounded-lg p-2.5 text-center">
            <Droplets className="w-4 h-4 mx-auto text-blue-400 mb-1" />
            <div className="text-white font-semibold text-sm">{cur.humidity}%</div>
            <div className="text-slate-400 text-[10px]">Humidity</div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-2.5 text-center">
            <Wind className="w-4 h-4 mx-auto text-cyan-400 mb-1" />
            <div className="text-white font-semibold text-sm">{dualWind(cur.wind_mph, cur.wind_kph, useMetric)} {cur.wind_dir}</div>
            <div className="text-slate-400 text-[10px]">Wind{cur.gust_mph > cur.wind_mph + 5 ? ` (G${useMetric ? Math.round(cur.gust_kph) : Math.round(cur.gust_mph)})` : ''}</div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-2.5 text-center">
            <Gauge className="w-4 h-4 mx-auto text-purple-400 mb-1" />
            <div className="text-white font-semibold text-sm">{useMetric ? `${cur.pressure_mb} mb` : `${cur.pressure_in} in`}</div>
            <div className="text-slate-400 text-[10px]">Pressure</div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-2.5 text-center">
            <Eye className="w-4 h-4 mx-auto text-green-400 mb-1" />
            <div className="text-white font-semibold text-sm">{dualVis(cur.visibility_miles, cur.visibility_km, useMetric)}</div>
            <div className="text-slate-400 text-[10px]">Visibility</div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          {cur.uv !== undefined && (
            <span>UV: <span className={getUVLabel(cur.uv).color}>{cur.uv} ({getUVLabel(cur.uv).label})</span></span>
          )}
          {airQuality?.us_epa_index && (
            <span>AQI: <span className={getAQILabel(airQuality.us_epa_index).color}>{getAQILabel(airQuality.us_epa_index).label}</span></span>
          )}
          {cur.cloud !== undefined && (
            <span>Cloud: {cur.cloud}%</span>
          )}
          {cur.precip_in > 0 && (
            <span>Precip: {dualPrecip(cur.precip_in, cur.precip_mm, useMetric)}</span>
          )}
        </div>

        {forecast.length > 0 && (
          <>
            <Separator className="bg-slate-700" />
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {forecast.length}-Day Forecast
              </h4>
              <div className="space-y-1">
                {forecast.map((day: any, i: number) => {
                  const d = new Date(day.date + 'T12:00:00');
                  const dayName = i === 0 ? 'Today' : DAY_NAMES[d.getDay()];
                  return (
                    <div key={i} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className="text-slate-300 w-10 text-xs font-medium">{dayName}</span>
                      <span className="text-base shrink-0">{getConditionIcon(day.day.condition)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-white font-semibold text-xs">
                            {useMetric ? `${Math.round(day.day.maxtemp_c)}°` : `${Math.round(day.day.maxtemp_f)}°`}
                          </span>
                          <span className="text-slate-500 text-xs">/</span>
                          <span className="text-slate-400 text-xs">
                            {useMetric ? `${Math.round(day.day.mintemp_c)}°` : `${Math.round(day.day.mintemp_f)}°`}
                          </span>
                          <span className="text-slate-500 text-[10px] truncate hidden sm:inline">{day.day.condition}</span>
                        </div>
                      </div>
                      {day.day.daily_chance_of_rain > 0 && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Droplets className="w-3 h-3 text-blue-400" />
                          <span className="text-blue-400 text-[10px]">{day.day.daily_chance_of_rain}%</span>
                        </div>
                      )}
                      <span className="text-slate-500 text-[10px] w-12 text-right hidden sm:block">
                        {dualWind(day.day.maxwind_mph, day.day.maxwind_kph, useMetric)}
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
                  <Sunrise className="w-4 h-4 text-orange-400" />
                  <span className="text-slate-300 text-xs">{forecast[0]?.astro?.sunrise}</span>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-2 flex items-center gap-2">
                  <Sunset className="w-4 h-4 text-orange-500" />
                  <span className="text-slate-300 text-xs">{forecast[0]?.astro?.sunset}</span>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-2 flex items-center gap-2">
                  <Moon className="w-4 h-4 text-indigo-400" />
                  <span className="text-slate-300 text-xs">{forecast[0]?.astro?.moon_phase}</span>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-2 flex items-center gap-2">
                  <span className="text-indigo-400 text-xs">🌙</span>
                  <span className="text-slate-300 text-xs">{forecast[0]?.astro?.moon_illumination}% lit</span>
                </div>
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

        <div className="text-[10px] text-slate-500 text-right">
          Source: {data.source || 'Weather API'}
        </div>
      </CardContent>
    </Card>
  );
}
