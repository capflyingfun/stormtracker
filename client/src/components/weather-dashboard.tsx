import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cloud, Droplets, Wind, Eye, Sun, Sunrise, Sunset, Gauge, CloudRain, ChevronDown, ChevronUp } from "lucide-react";

interface WeatherDashboardProps {
  lat: number;
  lon: number;
  locationName: string;
  useMetric?: boolean;
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

function fToC(f: number) { return (f - 32) * 5 / 9; }
function mphToKmh(mph: number) { return mph * 1.60934; }
function mphToKt(mph: number) { return mph * 0.868976; }
function inToMm(inch: number) { return inch * 25.4; }
function ftToKm(ft: number) { return ft * 0.0003048; }
function ftToMi(ft: number) { return ft / 5280; }
function hpaToInhg(hpa: number) { return hpa * 0.02953; }

function DualTemp({ f, useMetric }: { f: number; useMetric?: boolean }) {
  const primary = useMetric ? Math.round(fToC(f)) : Math.round(f);
  const secondary = useMetric ? Math.round(f) : Math.round(fToC(f));
  const pUnit = useMetric ? "°C" : "°F";
  const sUnit = useMetric ? "°F" : "°C";
  return (
    <span>
      <span className="text-white font-medium">{primary}{pUnit}</span>
      <span className="text-slate-500 text-xs ml-1">/{secondary}{sUnit}</span>
    </span>
  );
}

function DualWind({ mph, dir, useMetric }: { mph: number; dir?: string; useMetric?: boolean }) {
  const primary = useMetric ? Math.round(mphToKmh(mph)) : Math.round(mph);
  const secondary = useMetric ? Math.round(mph) : Math.round(mphToKmh(mph));
  const pUnit = useMetric ? " km/h" : " mph";
  const sUnit = useMetric ? " mph" : " km/h";
  const kt = Math.round(mphToKt(mph));
  return (
    <span>
      <span className="text-white font-medium">{primary}{pUnit}</span>
      <span className="text-slate-500 text-xs ml-1">/{secondary}{sUnit}</span>
      <span className="text-slate-600 text-xs ml-1">({kt}kt)</span>
      {dir && <span className="text-slate-400 text-xs ml-1">{dir}</span>}
    </span>
  );
}

function DualPrecip({ inch, useMetric }: { inch: number; useMetric?: boolean }) {
  const primary = useMetric ? inToMm(inch).toFixed(1) : inch.toFixed(2);
  const secondary = useMetric ? inch.toFixed(2) : inToMm(inch).toFixed(1);
  const pUnit = useMetric ? " mm" : '"';
  const sUnit = useMetric ? '"' : " mm";
  return (
    <span>
      <span className="text-white font-medium">{primary}{pUnit}</span>
      <span className="text-slate-500 text-xs ml-1">/{secondary}{sUnit}</span>
    </span>
  );
}

function DualVis({ ft, useMetric }: { ft: number; useMetric?: boolean }) {
  const mi = ftToMi(ft);
  const km = ftToKm(ft);
  const primary = useMetric ? km.toFixed(1) : mi.toFixed(1);
  const secondary = useMetric ? mi.toFixed(1) : km.toFixed(1);
  const pUnit = useMetric ? " km" : " mi";
  const sUnit = useMetric ? " mi" : " km";
  return (
    <span>
      <span className="text-white font-medium">{primary}{pUnit}</span>
      <span className="text-slate-500 text-xs ml-1">/{secondary}{sUnit}</span>
    </span>
  );
}

function DualPressure({ hpa, useMetric }: { hpa: number; useMetric?: boolean }) {
  const inhg = hpaToInhg(hpa).toFixed(2);
  const mb = Math.round(hpa);
  return (
    <span>
      <span className="text-white font-medium">{useMetric ? `${mb} mb` : `${inhg} inHg`}</span>
      <span className="text-slate-500 text-xs ml-1">/{useMetric ? `${inhg} inHg` : `${mb} mb`}</span>
    </span>
  );
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

interface HybridDay {
  dayName: string;
  date: string;
  hiF: number;
  loF: number;
  icon: string;
  label: string;
  precip: number;
  windMph: number;
  nwsDay?: any;
  nwsNight?: any;
  source: 'hybrid' | 'blended';
}

function buildHybridForecast(daily: any, nwsPeriods: any[] | null): HybridDay[] {
  const days: HybridDay[] = [];

  const nwsByDate: Record<string, { day?: any; night?: any }> = {};
  if (nwsPeriods) {
    const dayNames: Record<string, string> = {};
    const firstDate = daily.time[0];
    for (let d = 0; d < daily.time.length; d++) {
      const iso = daily.time[d];
      const dt = new Date(iso + 'T12:00:00');
      const name = d === 0 ? 'today' : d === 1 ? 'tomorrow' : dt.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      dayNames[name] = iso;
    }
    dayNames['tonight'] = firstDate;
    dayNames['this afternoon'] = firstDate;
    dayNames['overnight'] = firstDate;
    dayNames['this evening'] = firstDate;

    for (const p of nwsPeriods) {
      const rawName = (p.name || '').toLowerCase();
      const pName = rawName.replace(' night', '').replace(' evening', '');
      let matchDate: string | null = null;
      for (const [key, iso] of Object.entries(dayNames)) {
        if (pName === key || pName.startsWith(key)) {
          matchDate = iso;
          break;
        }
      }
      if (!matchDate) {
        for (const [key, iso] of Object.entries(dayNames)) {
          if (pName.includes(key) || key.includes(pName)) { matchDate = iso; break; }
        }
      }
      if (matchDate) {
        if (!nwsByDate[matchDate]) nwsByDate[matchDate] = {};
        if (p.isDaytime) nwsByDate[matchDate].day = p;
        else nwsByDate[matchDate].night = p;
      }
    }
  }

  for (let i = 0; i < daily.time.length; i++) {
    const t = daily.time[i];
    const omHiF = daily.tempMax[i];
    const omLoF = daily.tempMin[i];
    const omCode = daily.weatherCode[i];
    const omInfo = getWeatherInfo(omCode);
    const precip = daily.precipProbMax[i];
    const windMph = daily.windMax[i];

    const nws = nwsByDate[t];
    if (nws && (nws.day || nws.night)) {
      const nwsDayTemp = nws.day?.temperature;
      const nwsNightTemp = nws.night?.temperature;
      const nwsDayUnit = nws.day?.temperatureUnit || 'F';
      const nwsNightUnit = nws.night?.temperatureUnit || 'F';

      const nwsHiF = nwsDayTemp != null ? (nwsDayUnit === 'F' ? nwsDayTemp : Math.round(nwsDayTemp * 9/5 + 32)) : null;
      const nwsLoF = nwsNightTemp != null ? (nwsNightUnit === 'F' ? nwsNightTemp : Math.round(nwsNightTemp * 9/5 + 32)) : null;

      const avgHi = nwsHiF != null ? Math.round((omHiF + nwsHiF) / 2) : omHiF;
      const avgLo = nwsLoF != null ? Math.round((omLoF + nwsLoF) / 2) : omLoF;

      const nwsShort = nws.day?.shortForecast || nws.night?.shortForecast || '';
      const nwsLabel = nwsShort || omInfo.label;

      let icon = omInfo.icon;
      const sl = nwsShort.toLowerCase();
      if (sl.includes('thunder')) icon = '⛈️';
      else if (sl.includes('snow') || sl.includes('blizzard')) icon = '❄️';
      else if (sl.includes('freezing rain') || sl.includes('ice')) icon = '🧊';
      else if (sl.includes('rain') || sl.includes('showers')) icon = '🌧️';
      else if (sl.includes('drizzle')) icon = '🌦️';
      else if (sl.includes('fog')) icon = '🌫️';
      else if (sl.includes('cloudy') || sl.includes('overcast')) icon = '☁️';
      else if (sl.includes('partly')) icon = '⛅';
      else if (sl.includes('mostly sunny') || sl.includes('mostly clear')) icon = '🌤️';
      else if (sl.includes('sunny') || sl.includes('clear')) icon = '☀️';

      days.push({
        dayName: getDayName(t, i),
        date: t,
        hiF: avgHi,
        loF: avgLo,
        icon,
        label: nwsLabel,
        precip,
        windMph,
        nwsDay: nws.day,
        nwsNight: nws.night,
        source: 'hybrid',
      });
    } else {
      days.push({
        dayName: getDayName(t, i),
        date: t,
        hiF: omHiF,
        loF: omLoF,
        icon: omInfo.icon,
        label: omInfo.label,
        precip,
        windMph,
        source: 'blended',
      });
    }
  }
  return days;
}

const HAZARD_ICONS: { keyword: string; emoji: string; tier: 'warning' | 'watch' | 'advisory' }[] = [
  { keyword: 'tornado',             emoji: '🌪️', tier: 'warning' },
  { keyword: 'severe thunderstorm', emoji: '⛈️',  tier: 'warning' },
  { keyword: 'hurricane',           emoji: '🌀', tier: 'warning' },
  { keyword: 'tropical storm',      emoji: '🌀', tier: 'warning' },
  { keyword: 'flash flood',         emoji: '🌊', tier: 'warning' },
  { keyword: 'blizzard',            emoji: '🌨️', tier: 'warning' },
  { keyword: 'ice storm',           emoji: '🧊', tier: 'warning' },
  { keyword: 'winter storm',        emoji: '❄️',  tier: 'warning' },
  { keyword: 'excessive heat',      emoji: '🔥', tier: 'warning' },
  { keyword: 'extreme heat',        emoji: '🔥', tier: 'warning' },
  { keyword: 'damaging wind',       emoji: '🌬️', tier: 'warning' },
  { keyword: 'large hail',          emoji: '🧊', tier: 'warning' },
  { keyword: 'storm surge',         emoji: '🌊', tier: 'warning' },
  { keyword: 'high wind',           emoji: '🌬️', tier: 'watch' },
  { keyword: 'severe weather',      emoji: '⛈️',  tier: 'watch' },
  { keyword: 'flooding',            emoji: '🌊', tier: 'watch' },
  { keyword: 'heat advisory',       emoji: '🌡️', tier: 'watch' },
  { keyword: 'freeze warning',      emoji: '🥶', tier: 'watch' },
  { keyword: 'fire weather',        emoji: '🔥', tier: 'watch' },
  { keyword: 'dense fog',           emoji: '🌫️', tier: 'advisory' },
  { keyword: 'freezing rain',       emoji: '🧊', tier: 'advisory' },
  { keyword: 'sleet',               emoji: '🧊', tier: 'advisory' },
  { keyword: 'thunderstorm',        emoji: '⛈️',  tier: 'advisory' },
  { keyword: 'strong storms',       emoji: '⛈️',  tier: 'advisory' },
  { keyword: 'scattered storms',    emoji: '🌩️', tier: 'advisory' },
  { keyword: 'gusty wind',          emoji: '💨', tier: 'advisory' },
  { keyword: 'heavy rain',          emoji: '🌧️', tier: 'advisory' },
  { keyword: 'hail',                emoji: '🧊', tier: 'advisory' },
  { keyword: 'fog',                 emoji: '🌫️', tier: 'advisory' },
  { keyword: 'frost',               emoji: '❄️',  tier: 'advisory' },
  { keyword: 'wind chill',          emoji: '🥶', tier: 'advisory' },
  { keyword: 'wintry mix',          emoji: '🧊', tier: 'advisory' },
];

function getForecastIcon(shortForecast: string, detailed: string): { emoji: string; tier: 'warning' | 'watch' | 'advisory' } | null {
  const text = `${shortForecast} ${detailed}`.toLowerCase();
  for (const h of HAZARD_ICONS) {
    if (text.includes(h.keyword)) return { emoji: h.emoji, tier: h.tier };
  }
  return null;
}

export default function WeatherDashboard({ lat, lon, locationName, useMetric }: WeatherDashboardProps) {
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

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

  const tempF = c.temperature_2m;
  const feelsF = c.apparent_temperature;
  const dewF = c.dew_point_2m;
  const primaryTemp = useMetric ? Math.round(fToC(tempF)) : Math.round(tempF);
  const secondaryTemp = useMetric ? Math.round(tempF) : Math.round(fToC(tempF));
  const primaryFeels = useMetric ? Math.round(fToC(feelsF)) : Math.round(feelsF);
  const secondaryFeels = useMetric ? Math.round(feelsF) : Math.round(fToC(feelsF));
  const pTempUnit = useMetric ? "°C" : "°F";
  const sTempUnit = useMetric ? "°F" : "°C";

  const nowHourIdx = forecast.hourly.time.findIndex((t: string) => new Date(t) >= new Date());
  const startIdx = Math.max(0, nowHourIdx);
  const hourlySlice = {
    time: forecast.hourly.time.slice(startIdx, startIdx + 24),
    temperature: forecast.hourly.temperature.slice(startIdx, startIdx + 24),
    weatherCode: forecast.hourly.weatherCode.slice(startIdx, startIdx + 24),
    precipProbability: forecast.hourly.precipProbability.slice(startIdx, startIdx + 24),
    windSpeed: forecast.hourly.windSpeed.slice(startIdx, startIdx + 24),
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
          <div>
            <span className="text-5xl font-bold text-white">{primaryTemp}°</span>
            <span className="text-2xl text-slate-500 ml-1">{secondaryTemp}°</span>
          </div>
          <div className="mb-1">
            <p className="text-sm text-slate-300">{weather.label}</p>
            <p className="text-xs text-slate-400">
              Feels {primaryFeels}{pTempUnit}
              <span className="text-slate-600"> / {secondaryFeels}{sTempUnit}</span>
            </p>
            {dewF != null && (
              <p className="text-xs text-slate-500">
                Dew point {useMetric ? Math.round(fToC(dewF)) : Math.round(dewF)}{pTempUnit}
                <span className="text-slate-600"> / {useMetric ? Math.round(dewF) : Math.round(fToC(dewF))}{sTempUnit}</span>
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-slate-700/40 rounded-lg p-2.5 flex items-center gap-2">
            <Wind className="h-4 w-4 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Wind</p>
              <p className="text-sm leading-snug"><DualWind mph={c.wind_speed_10m} dir={getWindDirection(c.wind_direction_10m)} useMetric={useMetric} /></p>
              {c.wind_gusts_10m > c.wind_speed_10m + 5 && (
                <p className="text-xs text-yellow-400">Gusts <DualWind mph={c.wind_gusts_10m} useMetric={useMetric} /></p>
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
              <p className="text-sm leading-snug"><DualPressure hpa={c.surface_pressure} useMetric={useMetric} /></p>
            </div>
          </div>
          <div className="bg-slate-700/40 rounded-lg p-2.5 flex items-center gap-2">
            <Eye className="h-4 w-4 text-slate-300 shrink-0" />
            <div>
              <p className="text-xs text-slate-400">Visibility</p>
              <p className="text-sm leading-snug">{c.visibility ? <DualVis ft={c.visibility} useMetric={useMetric} /> : 'N/A'}</p>
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
              <p className="text-sm leading-snug"><DualPrecip inch={c.precipitation} useMetric={useMetric} /> /hr</p>
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
            const tF = hourlySlice.temperature[i];
            const primary = useMetric ? Math.round(fToC(tF)) : Math.round(tF);
            return (
              <div key={t} className="flex flex-col items-center gap-1 min-w-[52px]">
                <p className="text-xs text-slate-400">{i === 0 ? "Now" : formatTime(t)}</p>
                <span className="text-lg">{hw.icon}</span>
                <p className="text-sm font-medium text-white">{primary}°</p>
                {hourlySlice.precipProbability[i] > 0 && (
                  <p className="text-xs text-blue-400">{hourlySlice.precipProbability[i]}%</p>
                )}
                <p className="text-xs text-slate-500">{useMetric ? Math.round(mphToKmh(hourlySlice.windSpeed[i])) : Math.round(hourlySlice.windSpeed[i])}<span className="text-slate-600">{useMetric ? 'km/h' : 'mph'}</span></p>
              </div>
            );
          })}
        </div>
      </div>

      {(() => {
        const hasNws = forecast.nwsForecast && forecast.nwsForecast.length > 0;
        const hybridDays = buildHybridForecast(forecast.daily, forecast.nwsForecast);
        const sourceCount = forecast.forecastSourceCount || (hasNws ? 2 : 1);
        const regionalLabel = forecast.regionalModels || '';
        const sourceBadge = hasNws
          ? `NWS + ${regionalLabel} + Open-Meteo`
          : regionalLabel
            ? `${regionalLabel} + Open-Meteo`
            : 'Open-Meteo';
        const regionEmoji: Record<string, string> = {
          us: '🇺🇸', canada: '🇨🇦', mexico: '🇲🇽', europe: '🇪🇺', uk: '🇬🇧',
          scandinavia: '🇳🇴', japan: '🇯🇵', china: '🇨🇳', india: '🇮🇳',
          australia: '🇦🇺', newzealand: '🇳🇿', southamerica: '🌎', africa: '🌍',
          southeast_asia: '🌏', global: '🌐',
        };
        const rEmoji = regionEmoji[forecast.region || ''] || '🌐';
        return (
          <div className={`bg-slate-800/60 rounded-xl p-4 border ${sourceCount >= 3 ? 'border-blue-700/30' : sourceCount >= 2 ? 'border-cyan-700/30' : 'border-slate-700/50'}`}>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-sm">{rEmoji}</span>
              {hasNws && <span className="text-sm">🏛️</span>}
              <h3 className="text-sm font-semibold text-white">7-Day Forecast</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                sourceCount >= 3 ? 'bg-blue-900/40 text-blue-300 border-blue-700/30' :
                sourceCount >= 2 ? 'bg-cyan-900/40 text-cyan-300 border-cyan-700/30' :
                'bg-slate-700/40 text-slate-300 border-slate-600/30'
              }`}>
                {sourceBadge} ({sourceCount} sources)
              </span>
            </div>
            <div className="space-y-1">
              {hybridDays.map((day, i) => {
                const isExpanded = expandedDay === i;
                const hi = useMetric ? Math.round(fToC(day.hiF)) : Math.round(day.hiF);
                const lo = useMetric ? Math.round(fToC(day.loF)) : Math.round(day.loF);
                const hiAlt = useMetric ? Math.round(day.hiF) : Math.round(fToC(day.hiF));
                const loAlt = useMetric ? Math.round(day.loF) : Math.round(fToC(day.loF));
                const hasDetail = day.nwsDay || day.nwsNight;
                const hazard = hasDetail ? getForecastIcon(
                  (day.nwsDay?.shortForecast || '') + ' ' + (day.nwsNight?.shortForecast || ''),
                  (day.nwsDay?.detailedForecast || '') + ' ' + (day.nwsNight?.detailedForecast || '')
                ) : null;
                const ringClass = hazard?.tier === 'warning' ? 'ring-1 ring-red-500/40' : hazard?.tier === 'watch' ? 'ring-1 ring-orange-500/30' : hazard ? 'ring-1 ring-yellow-500/30' : '';
                const labelColor = hazard?.tier === 'warning' ? 'text-red-300' : hazard?.tier === 'watch' ? 'text-orange-300' : hazard ? 'text-yellow-300' : 'text-slate-400';

                return (
                  <div key={day.date}>
                    <button
                      type="button"
                      onClick={() => hasDetail ? setExpandedDay(isExpanded ? null : i) : null}
                      className={`w-full text-left rounded-lg p-2 transition-colors ${
                        isExpanded ? 'bg-slate-700/60' : hasDetail ? 'bg-slate-700/20 hover:bg-slate-700/40' : ''
                      } ${ringClass}`}
                    >
                      <div className="flex items-center gap-2">
                        {hazard && <span className="text-sm shrink-0">{hazard.emoji}</span>}
                        <span className="text-sm text-slate-300 w-16 shrink-0 font-medium">{day.dayName}</span>
                        <span className="text-lg w-8 text-center">{day.icon}</span>
                        <span className={`text-xs flex-1 truncate hidden sm:block ${labelColor}`}>{day.label}</span>
                        {day.precip > 0 && (
                          <span className="text-xs text-blue-400 w-10 text-right shrink-0">{day.precip}%</span>
                        )}
                        <div className="flex items-center gap-1 shrink-0 text-xs text-slate-500">
                          <Wind className="h-3 w-3" />
                          {useMetric ? Math.round(mphToKmh(day.windMph)) : Math.round(day.windMph)}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs">⤴️</span>
                          <span className="text-sm font-medium text-white w-8 text-right">{hi}°</span>
                          <span className="text-xs text-slate-600">/{hiAlt}°</span>
                          <span className="text-xs text-slate-500 mx-0.5">·</span>
                          <span className="text-xs">⤵️</span>
                          <span className="text-sm text-slate-400 w-6">{lo}°</span>
                          <span className="text-xs text-slate-600">/{loAlt}°</span>
                        </div>
                        {hasDetail && (
                          isExpanded ? <ChevronUp className="h-3 w-3 text-slate-500 shrink-0" /> : <ChevronDown className="h-3 w-3 text-slate-500 shrink-0" />
                        )}
                      </div>
                    </button>
                    {isExpanded && hasDetail && (
                      <div className="ml-2 mt-1 mb-2 space-y-1.5 border-l-2 border-blue-800/30 pl-3">
                        {day.nwsDay && (
                          <div className="text-xs">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-yellow-400">☀️</span>
                              <span className="font-medium text-slate-200">{day.nwsDay.name}</span>
                              <span className="text-slate-400">⤴️ High: {(() => {
                                const tf = day.nwsDay.temperatureUnit === 'F' ? day.nwsDay.temperature : Math.round(day.nwsDay.temperature * 9/5 + 32);
                                const tc = day.nwsDay.temperatureUnit === 'F' ? Math.round(fToC(day.nwsDay.temperature)) : day.nwsDay.temperature;
                                return useMetric ? `${tc}°C (${tf}°F)` : `${tf}°F (${tc}°C)`;
                              })()}</span>
                              {day.nwsDay.windSpeed && <span className="text-slate-500">{day.nwsDay.windSpeed}</span>}
                            </div>
                            <p className="text-slate-300 leading-relaxed">{day.nwsDay.detailedForecast}</p>
                          </div>
                        )}
                        {day.nwsNight && (
                          <div className="text-xs">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-indigo-400">🌙</span>
                              <span className="font-medium text-slate-200">{day.nwsNight.name}</span>
                              <span className="text-slate-400">⤵️ Low: {(() => {
                                const tf = day.nwsNight.temperatureUnit === 'F' ? day.nwsNight.temperature : Math.round(day.nwsNight.temperature * 9/5 + 32);
                                const tc = day.nwsNight.temperatureUnit === 'F' ? Math.round(fToC(day.nwsNight.temperature)) : day.nwsNight.temperature;
                                return useMetric ? `${tc}°C (${tf}°F)` : `${tf}°F (${tc}°C)`;
                              })()}</span>
                              {day.nwsNight.windSpeed && <span className="text-slate-500">{day.nwsNight.windSpeed}</span>}
                            </div>
                            <p className="text-slate-300 leading-relaxed">{day.nwsNight.detailedForecast}</p>
                          </div>
                        )}
                        {day.source === 'hybrid' && (
                          <p className="text-[10px] text-slate-600 italic">Temps averaged from {sourceBadge}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {(forecast.astronomy || forecast.airQuality) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {forecast.astronomy && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-indigo-700/30">
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
                <span>🌙</span> Moon & Astronomy
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-slate-500">Phase</p>
                  <p className="text-slate-200">{forecast.astronomy.moonPhase}</p>
                </div>
                <div>
                  <p className="text-slate-500">Illumination</p>
                  <p className="text-slate-200">{forecast.astronomy.moonIllumination}%</p>
                </div>
                <div>
                  <p className="text-slate-500">Moonrise</p>
                  <p className="text-slate-200">{forecast.astronomy.moonrise || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Moonset</p>
                  <p className="text-slate-200">{forecast.astronomy.moonset || '—'}</p>
                </div>
              </div>
            </div>
          )}
          {forecast.airQuality && (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-green-700/30">
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
                <span>🌬️</span> Air Quality
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  forecast.airQuality.usEpaIndex <= 1 ? 'bg-green-900/40 text-green-300 border border-green-700/30' :
                  forecast.airQuality.usEpaIndex <= 2 ? 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/30' :
                  forecast.airQuality.usEpaIndex <= 3 ? 'bg-orange-900/40 text-orange-300 border border-orange-700/30' :
                  'bg-red-900/40 text-red-300 border border-red-700/30'
                }`}>
                  {forecast.airQuality.usEpaIndex <= 1 ? 'Good' :
                   forecast.airQuality.usEpaIndex <= 2 ? 'Moderate' :
                   forecast.airQuality.usEpaIndex <= 3 ? 'Unhealthy for Sensitive' :
                   forecast.airQuality.usEpaIndex <= 4 ? 'Unhealthy' :
                   forecast.airQuality.usEpaIndex <= 5 ? 'Very Unhealthy' : 'Hazardous'}
                </span>
              </h3>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-slate-500">PM2.5</p>
                  <p className="text-slate-200">{forecast.airQuality.pm25?.toFixed(1)} µg/m³</p>
                </div>
                <div>
                  <p className="text-slate-500">PM10</p>
                  <p className="text-slate-200">{forecast.airQuality.pm10?.toFixed(1)} µg/m³</p>
                </div>
                <div>
                  <p className="text-slate-500">O₃</p>
                  <p className="text-slate-200">{forecast.airQuality.o3?.toFixed(1)} µg/m³</p>
                </div>
                <div>
                  <p className="text-slate-500">NO₂</p>
                  <p className="text-slate-200">{forecast.airQuality.no2?.toFixed(1)} µg/m³</p>
                </div>
                <div>
                  <p className="text-slate-500">CO</p>
                  <p className="text-slate-200">{forecast.airQuality.co?.toFixed(1)} µg/m³</p>
                </div>
                <div>
                  <p className="text-slate-500">SO₂</p>
                  <p className="text-slate-200">{forecast.airQuality.so2?.toFixed(1)} µg/m³</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
