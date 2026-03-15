import { useQuery } from "@tanstack/react-query";
import { Cloud, Droplets, Wind, Eye, Thermometer, Sun, Sunrise, Sunset, Gauge, CloudRain, Snowflake, CloudFog, CloudLightning, CloudDrizzle, CloudSun, CloudMoon, Moon } from "lucide-react";

interface WeatherDashboardProps {
  lat: number;
  lon: number;
  locationName: string;
}

const WMO_CODES: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear sky", icon: "☀️" },
  1: { label: "Mainly clear", icon: "🌤️" },
  2: { label: "Partly cloudy", icon: "⛅" },
  3: { label: "Overcast", icon: "☁️" },
  45: { label: "Fog", icon: "🌫️" },
  48: { label: "Depositing rime fog", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" },
  53: { label: "Moderate drizzle", icon: "🌦️" },
  55: { label: "Dense drizzle", icon: "🌧️" },
  56: { label: "Light freezing drizzle", icon: "🌧️" },
  57: { label: "Dense freezing drizzle", icon: "🌧️" },
  61: { label: "Slight rain", icon: "🌧️" },
  63: { label: "Moderate rain", icon: "🌧️" },
  65: { label: "Heavy rain", icon: "🌧️" },
  66: { label: "Light freezing rain", icon: "🌧️" },
  67: { label: "Heavy freezing rain", icon: "🌧️" },
  71: { label: "Slight snow", icon: "🌨️" },
  73: { label: "Moderate snow", icon: "🌨️" },
  75: { label: "Heavy snow", icon: "❄️" },
  77: { label: "Snow grains", icon: "❄️" },
  80: { label: "Slight showers", icon: "🌦️" },
  81: { label: "Moderate showers", icon: "🌧️" },
  82: { label: "Violent showers", icon: "🌧️" },
  85: { label: "Slight snow showers", icon: "🌨️" },
  86: { label: "Heavy snow showers", icon: "❄️" },
  95: { label: "Thunderstorm", icon: "⛈️" },
  96: { label: "Thunderstorm w/ slight hail", icon: "⛈️" },
  99: { label: "Thunderstorm w/ heavy hail", icon: "⛈️" },
};

function getWeatherInfo(code: number) {
  return WMO_CODES[code] || { label: "Unknown", icon: "🌡️" };
}

function getWindDirection(deg: number) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function getUVLabel(uv: number) {
  if (uv <= 2) return { label: "Low", color: "text-green-400" };
  if (uv <= 5) return { label: "Moderate", color: "text-yellow-400" };
  if (uv <= 7) return { label: "High", color: "text-orange-400" };
  if (uv <= 10) return { label: "Very High", color: "text-red-400" };
  return { label: "Extreme", color: "text-purple-400" };
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12} ${ampm}`;
}

function formatSunTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  return `${h}:${m} ${ampm}`;
}

function getDayName(iso: string, i: number) {
  if (i === 0) return "Today";
  if (i === 1) return "Tomorrow";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
}

export default function WeatherDashboard({ lat, lon, locationName }: WeatherDashboardProps) {
  const { data: forecast, isLoading, error } = useQuery<any>({
    queryKey: ["/api/forecast", lat, lon],
    queryFn: async () => {
      const res = await fetch(`/api/forecast?lat=${lat}&lon=${lon}`);
      if (!res.ok) throw new Error("Failed to fetch forecast");
      return res.json();
    },
    refetchInterval: 600000,
    staleTime: 300000,
  });

  if (isLoading) {
    return (
      <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-48 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-slate-700 rounded" />)}
        </div>
      </div>
    );
  }

  if (error || !forecast) {
    return (
      <div className="bg-slate-800/60 rounded-xl p-4 border border-red-700/50 text-red-400 text-sm">
        Unable to load weather data. Please try again later.
      </div>
    );
  }

  const c = forecast.current;
  const weather = getWeatherInfo(c.weather_code);
  const uv = getUVLabel(c.uv_index || 0);
  const isDay = c.is_day === 1;

  const nowHourIdx = forecast.hourly.time.findIndex((t: string) => new Date(t) >= new Date());
  const hourlySlice = {
    time: forecast.hourly.time.slice(Math.max(0, nowHourIdx), Math.max(0, nowHourIdx) + 24),
    temperature: forecast.hourly.temperature.slice(Math.max(0, nowHourIdx), Math.max(0, nowHourIdx) + 24),
    weatherCode: forecast.hourly.weatherCode.slice(Math.max(0, nowHourIdx), Math.max(0, nowHourIdx) + 24),
    precipProbability: forecast.hourly.precipProbability.slice(Math.max(0, nowHourIdx), Math.max(0, nowHourIdx) + 24),
    windSpeed: forecast.hourly.windSpeed.slice(Math.max(0, nowHourIdx), Math.max(0, nowHourIdx) + 24),
  };

  return (
    <div className="space-y-3">
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Current Weather</h3>
            <p className="text-xs text-slate-400">{locationName} · {forecast.timezoneAbbr}</p>
          </div>
          <span className="text-4xl">{weather.icon}</span>
        </div>

        <div className="flex items-end gap-3 mb-4">
          <span className="text-5xl font-bold text-white">{Math.round(c.temperature_2m)}°</span>
          <div className="mb-1">
            <p className="text-sm text-slate-300">{weather.label}</p>
            <p className="text-xs text-slate-400">Feels like {Math.round(c.apparent_temperature)}°F</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-slate-700/40 rounded-lg p-2.5 flex items-center gap-2">
            <Wind className="h-4 w-4 text-blue-400 shrink-0" />
            <div>
              <p className="text-xs text-slate-400">Wind</p>
              <p className="text-sm text-white font-medium">{Math.round(c.wind_speed_10m)} mph {getWindDirection(c.wind_direction_10m)}</p>
              {c.wind_gusts_10m > c.wind_speed_10m + 5 && (
                <p className="text-xs text-yellow-400">Gusts {Math.round(c.wind_gusts_10m)} mph</p>
              )}
            </div>
          </div>
          <div className="bg-slate-700/40 rounded-lg p-2.5 flex items-center gap-2">
            <Droplets className="h-4 w-4 text-cyan-400 shrink-0" />
            <div>
              <p className="text-xs text-slate-400">Humidity</p>
              <p className="text-sm text-white font-medium">{c.relative_humidity_2m}%</p>
            </div>
          </div>
          <div className="bg-slate-700/40 rounded-lg p-2.5 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-purple-400 shrink-0" />
            <div>
              <p className="text-xs text-slate-400">Pressure</p>
              <p className="text-sm text-white font-medium">{(c.surface_pressure * 0.02953).toFixed(2)} inHg</p>
            </div>
          </div>
          <div className="bg-slate-700/40 rounded-lg p-2.5 flex items-center gap-2">
            <Eye className="h-4 w-4 text-slate-300 shrink-0" />
            <div>
              <p className="text-xs text-slate-400">Visibility</p>
              <p className="text-sm text-white font-medium">{c.visibility ? `${(c.visibility / 5280).toFixed(1)} mi` : 'N/A'}</p>
            </div>
          </div>
          <div className="bg-slate-700/40 rounded-lg p-2.5 flex items-center gap-2">
            <Cloud className="h-4 w-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-xs text-slate-400">Cloud Cover</p>
              <p className="text-sm text-white font-medium">{c.cloud_cover}%</p>
            </div>
          </div>
          <div className="bg-slate-700/40 rounded-lg p-2.5 flex items-center gap-2">
            <Sun className={`h-4 w-4 shrink-0 ${uv.color}`} />
            <div>
              <p className="text-xs text-slate-400">UV Index</p>
              <p className={`text-sm font-medium ${uv.color}`}>{(c.uv_index || 0).toFixed(1)} {uv.label}</p>
            </div>
          </div>
          <div className="bg-slate-700/40 rounded-lg p-2.5 flex items-center gap-2">
            <CloudRain className="h-4 w-4 text-blue-300 shrink-0" />
            <div>
              <p className="text-xs text-slate-400">Precipitation</p>
              <p className="text-sm text-white font-medium">{c.precipitation}" /hr</p>
            </div>
          </div>
          {forecast.daily.sunrise?.[0] && (
            <div className="bg-slate-700/40 rounded-lg p-2.5 flex items-center gap-2">
              {isDay ? <Sunset className="h-4 w-4 text-orange-400 shrink-0" /> : <Sunrise className="h-4 w-4 text-yellow-400 shrink-0" />}
              <div>
                <p className="text-xs text-slate-400">{isDay ? 'Sunset' : 'Sunrise'}</p>
                <p className="text-sm text-white font-medium">
                  {isDay ? formatSunTime(forecast.daily.sunset[0]) : formatSunTime(forecast.daily.sunrise[0])}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-white mb-3">Next 24 Hours</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {hourlySlice.time.map((t: string, i: number) => {
            const hw = getWeatherInfo(hourlySlice.weatherCode[i]);
            return (
              <div key={t} className="flex flex-col items-center gap-1 min-w-[52px]">
                <p className="text-xs text-slate-400">{i === 0 ? "Now" : formatTime(t)}</p>
                <span className="text-lg">{hw.icon}</span>
                <p className="text-sm font-medium text-white">{Math.round(hourlySlice.temperature[i])}°</p>
                {hourlySlice.precipProbability[i] > 0 && (
                  <p className="text-xs text-blue-400">{hourlySlice.precipProbability[i]}%</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-white mb-3">7-Day Forecast</h3>
        <div className="space-y-2">
          {forecast.daily.time.map((t: string, i: number) => {
            const dw = getWeatherInfo(forecast.daily.weatherCode[i]);
            const hi = Math.round(forecast.daily.tempMax[i]);
            const lo = Math.round(forecast.daily.tempMin[i]);
            const precip = forecast.daily.precipProbMax[i];
            return (
              <div key={t} className="flex items-center gap-2 py-1.5 border-b border-slate-700/30 last:border-0">
                <span className="text-sm text-slate-300 w-16 shrink-0">{getDayName(t, i)}</span>
                <span className="text-lg w-8 text-center">{dw.icon}</span>
                <span className="text-xs text-slate-400 flex-1 truncate hidden sm:block">{dw.label}</span>
                {precip > 0 && (
                  <span className="text-xs text-blue-400 w-10 text-right shrink-0">{precip}%</span>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm font-medium text-white w-8 text-right">{hi}°</span>
                  <span className="text-xs text-slate-500">/</span>
                  <span className="text-sm text-slate-400 w-8">{lo}°</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
