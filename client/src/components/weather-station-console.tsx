import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/hooks/use-language';
import { Star, MapPin, RefreshCw, ChevronDown, TrendingUp, TrendingDown, Minus, Droplets, Thermometer, AlertTriangle, Radio, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface StationData {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  elev: number;
  obsTime: string;
  rawOb: string;
  tempF: number | null;
  tempC: number | null;
  dewF: number | null;
  dewC: number | null;
  humidity: number | null;
  feelsLike: { type: string; f: number; c: number | null } | null;
  wind: {
    direction: number | null;
    dirLabel: string;
    speedKts: number;
    gustKts: number | null;
    speedMph: number;
    gustMph: number | null;
    speedKmh: number;
    gustKmh: number | null;
    speedMs: number;
    gustMs: number | null;
    beaufort: { scale: number; description: string };
    gustBeaufort: { scale: number; description: string } | null;
  };
  pressure: {
    inHg: number | null;
    mb: number | null;
    mmHg: number | null;
    kPa: number | null;
    trend: string;
    previousMb: number | null;
  };
  visibility: { miles: number; km: number; meters: number; nauticalMiles: number } | null;
  clouds: any[];
  wxString: string | null;
  precip: any;
  moonPhase: { name: string; icon: string; age: number; illumination: number };
  decoded: { label: string; value: string; severity?: string }[];
}

interface NearbyStation {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  distance: number;
  tempF: number | null;
}

interface FavoriteStation {
  id: number;
  icao: string;
  name: string;
  lat: number;
  lon: number;
}

type WindUnit = 'mph' | 'kts' | 'kmh' | 'ms' | 'beaufort';
type TempUnit = 'f' | 'c';
type PressureUnit = 'inHg' | 'mb' | 'mmHg' | 'kPa';
type VisUnit = 'mi' | 'km' | 'm' | 'nm';

function useCycleUnit<T extends string>(key: string, options: T[]): [T, () => void] {
  const [idx, setIdx] = useState(() => {
    const saved = localStorage.getItem(`stormtracker_unit_${key}`);
    if (saved) { const i = options.indexOf(saved as T); if (i >= 0) return i; }
    return 0;
  });
  const cycle = useCallback(() => {
    setIdx(prev => {
      const next = (prev + 1) % options.length;
      localStorage.setItem(`stormtracker_unit_${key}`, options[next]);
      return next;
    });
  }, [key, options]);
  return [options[idx], cycle];
}

function TappableValue({ children, onClick, hint }: { children: React.ReactNode; onClick: () => void; hint: string }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-0.5 cursor-pointer active:scale-95 transition-transform group" title={`Tap to switch to ${hint}`}>
      {children}
      <span className="text-[7px] text-slate-600 group-hover:text-slate-400 transition-colors ml-0.5">⟳</span>
    </button>
  );
}

function getDirectionFromBearing(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function WindCompass({ wind, windUnit, cycleWind }: { wind: StationData['wind']; windUnit: WindUnit; cycleWind: () => void }) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const isCalm = wind.speedKts === 0;

  const getWindDisplay = (speed: number | null | undefined, gust: number | null | undefined) => {
    const s = speed ?? 0;
    const g = gust;
    switch (windUnit) {
      case 'mph': return { speed: wind.speedMph, gust: wind.gustMph, unit: 'mph' };
      case 'kts': return { speed: wind.speedKts, gust: wind.gustKts, unit: 'kts' };
      case 'kmh': return { speed: wind.speedKmh, gust: wind.gustKmh, unit: 'km/h' };
      case 'ms': return { speed: wind.speedMs, gust: wind.gustMs, unit: 'm/s' };
      case 'beaufort': return { speed: wind.beaufort.scale, gust: wind.gustBeaufort?.scale ?? null, unit: `Bft` };
    }
  };
  const d = getWindDisplay(wind.speedKts, wind.gustKts);
  const nextUnit: Record<WindUnit, string> = { mph: 'knots', kts: 'km/h', kmh: 'm/s', ms: 'Beaufort', beaufort: 'mph' };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36 sm:w-44 sm:h-44">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(100,116,139,0.3)" strokeWidth="2" />
          <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(100,116,139,0.15)" strokeWidth="1" />
          <circle cx="100" cy="100" r="50" fill="none" stroke="rgba(100,116,139,0.1)" strokeWidth="1" />
          {dirs.map((d, i) => {
            const angle = i * 45 - 90;
            const rad = angle * Math.PI / 180;
            const x = 100 + 82 * Math.cos(rad);
            const y = 100 + 82 * Math.sin(rad);
            return (
              <text key={d} x={x} y={y} textAnchor="middle" dominantBaseline="central"
                className={`${i % 2 === 0 ? 'text-[11px] font-bold fill-slate-300' : 'text-[9px] fill-slate-500'}`}>
                {d}
              </text>
            );
          })}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const rad = (a - 90) * Math.PI / 180;
            return (
              <line key={a} x1={100 + 60 * Math.cos(rad)} y1={100 + 60 * Math.sin(rad)}
                x2={100 + 68 * Math.cos(rad)} y2={100 + 68 * Math.sin(rad)}
                stroke="rgba(100,116,139,0.4)" strokeWidth="1.5" />
            );
          })}
          {!isCalm && wind.direction != null && (
            <g transform={`rotate(${wind.direction}, 100, 100)`}>
              <polygon points="100,30 93,65 100,55 107,65" fill="#22c55e" opacity="0.9" />
              <line x1="100" y1="55" x2="100" y2="140" stroke="#22c55e" strokeWidth="2.5" opacity="0.7" />
            </g>
          )}
          <circle cx="100" cy="100" r="22" fill="rgba(15,23,42,0.9)" stroke="rgba(100,116,139,0.3)" strokeWidth="1" />
          <text x="100" y="96" textAnchor="middle" dominantBaseline="central" className="text-[14px] font-bold fill-green-400">
            {wind.direction != null ? `${wind.direction}°` : '--'}
          </text>
          <text x="100" y="112" textAnchor="middle" dominantBaseline="central" className="text-[8px] fill-slate-500">
            {wind.dirLabel}
          </text>
        </svg>
      </div>
      <TappableValue onClick={cycleWind} hint={nextUnit[windUnit]}>
        <div className="flex items-center gap-4 mt-1">
          <div className="text-center">
            <span className="text-[9px] text-slate-500 uppercase block">Speed</span>
            <span className="text-white font-bold text-sm">{d.speed ?? '--'}</span>
            <span className="text-slate-400 text-[10px]"> {d.unit}</span>
          </div>
          {d.gust != null && (
            <div className="text-center">
              <span className="text-[9px] text-slate-500 uppercase block">Gust</span>
              <span className="text-orange-400 font-bold text-sm">{d.gust}</span>
              <span className="text-slate-400 text-[10px]"> {d.unit}</span>
            </div>
          )}
        </div>
      </TappableValue>
      {windUnit === 'beaufort' && (
        <span className="text-[9px] text-green-400 mt-0.5">
          {wind.beaufort.description}
          {wind.gustBeaufort && wind.gustBeaufort.scale !== wind.beaufort.scale && (
            <span className="text-orange-400"> · Gusts: {wind.gustBeaufort.description}</span>
          )}
        </span>
      )}
    </div>
  );
}

function CircularGauge({ value, max, label, unit, color, icon, onClick, hint }: { value: number | null; max: number; label: string; unit: string; color: string; icon?: string; onClick?: () => void; hint?: string }) {
  const pct = value != null ? Math.min(value / max, 1) : 0;
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference * (1 - pct * 0.75);

  const inner = (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24 sm:w-28 sm:h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-[135deg]">
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(100,116,139,0.15)" strokeWidth="6" strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`} strokeLinecap="round" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`} strokeDashoffset={dashOffset} strokeLinecap="round" opacity="0.8" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {icon && <span className="text-lg mb-0.5">{icon}</span>}
          <span className="text-white font-bold text-base">{value ?? '--'}</span>
          <span className="text-slate-500 text-[9px]">{unit}</span>
        </div>
      </div>
      <span className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">{label}</span>
    </div>
  );

  if (onClick && hint) {
    return <TappableValue onClick={onClick} hint={hint}>{inner}</TappableValue>;
  }
  return inner;
}

function PressureTrendIcon({ trend }: { trend: string }) {
  if (trend === 'rising') return <TrendingUp className="w-4 h-4 text-green-400" />;
  if (trend === 'falling') return <TrendingDown className="w-4 h-4 text-red-400" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

function ForecastIconStrip({ lat, lon, icao }: { lat: number; lon: number; icao?: string }) {
  const { data: tafData } = useQuery<any>({
    queryKey: ['/api/taf', icao],
    queryFn: async () => { const r = await fetch(`/api/taf/${icao}`); if (!r.ok) throw new Error('fail'); return r.json(); },
    enabled: !!icao,
    staleTime: 600000,
  });

  const { data: forecastData } = useQuery<any>({
    queryKey: ['/api/weather-forecast', lat, lon],
    queryFn: async () => { const r = await fetch(`/api/weather-forecast?lat=${lat}&lon=${lon}`); if (!r.ok) throw new Error('fail'); return r.json(); },
    staleTime: 300000,
    enabled: !icao,
  });

  const getConditionEmoji = (condition: string): string => {
    const c = condition.toLowerCase();
    if (/thunder|tstorm/.test(c)) return '⛈️';
    if (/tornado|funnel/.test(c)) return '🌪️';
    if (/hurricane|cyclone/.test(c)) return '🌀';
    if (/blizzard|ice storm/.test(c)) return '❄️';
    if (/heavy rain|downpour/.test(c)) return '🌧️';
    if (/rain|drizzle|shower/.test(c)) return '🌦️';
    if (/snow|sleet|flurr/.test(c)) return '🌨️';
    if (/fog|mist|haz/.test(c)) return '🌫️';
    if (/overcast|cloudy/.test(c)) return '☁️';
    if (/partly|mostly cloudy|broken/.test(c)) return '⛅';
    if (/few cloud|scattered/.test(c)) return '🌤️';
    if (/clear|sunny|fair/.test(c)) return '☀️';
    if (/wind|gust/.test(c)) return '💨';
    return '🌤️';
  };

  const formatTafTime = (iso: string): { zulu: string; local: string } => {
    const d = new Date(iso);
    const now = new Date();
    const diffHrs = (d.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHrs < 1 && diffHrs > -1) return { zulu: 'Now', local: '' };
    const h = d.getUTCHours().toString().padStart(2, '0');
    const m = d.getUTCMinutes().toString().padStart(2, '0');
    const localStr = d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '');
    return { zulu: `${h}${m}Z`, local: localStr };
  };

  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null);

  interface TafItem {
    zuluLabel: string;
    localLabel: string;
    emoji: string;
    detail?: string;
    wxCodes?: string[];
    period?: any;
  }

  const items: TafItem[] = [];

  if (tafData?.periods?.length > 0) {
    tafData.periods.forEach((p: any) => {
      const time = p.from ? formatTafTime(p.from) : { zulu: p.changeType || '—', local: '' };
      const prefix = p.changeType === 'TEMPO' ? '~' : p.changeType === 'BECMG' ? '→' : '';
      const windInfo = p.windSpeedKts != null ? `${p.windSpeedKts}kt` : '';
      const gustInfo = p.windGustKts != null ? `G${p.windGustKts}` : '';
      const visInfo = p.visibilitySM != null && p.visibilitySM < 6 ? `${p.visibilitySM}SM` : '';
      const detail = [windInfo + gustInfo, visInfo].filter(Boolean).join(' ') || '';
      items.push({
        zuluLabel: prefix + time.zulu,
        localLabel: time.local,
        emoji: getConditionEmoji(p.condition),
        detail,
        wxCodes: p.wxCodes,
        period: p,
      });
    });
  } else if (forecastData) {
    const nwsPeriods = forecastData.nws_periods || [];
    const forecast = forecastData.forecast || [];
    if (nwsPeriods.length > 0) {
      nwsPeriods.slice(0, 8).forEach((p: any) => {
        const shortName = p.name.replace(' Night', ' N').replace('This Afternoon', 'PM').replace('Tonight', 'Eve').replace('Overnight', 'Ovnt');
        items.push({ zuluLabel: shortName.length > 5 ? shortName.slice(0, 5) : shortName, localLabel: '', emoji: getConditionEmoji(p.shortForecast), detail: p.temperature_f != null ? `${p.temperature_f}°` : '' });
      });
    } else if (forecast.length > 0) {
      forecast.slice(0, 7).forEach((f: any, i: number) => {
        const d = new Date(f.date + 'T12:00:00');
        const dayName = i === 0 ? 'Today' : d.toLocaleDateString('en', { weekday: 'short' });
        items.push({ zuluLabel: dayName, localLabel: '', emoji: getConditionEmoji(f.day.condition), detail: `${Math.round(f.day.maxtemp_f)}°` });
      });
    }
  }

  if (items.length === 0) return null;

  const isTaf = !!tafData?.periods?.length;

  const formatCloudLayer = (c: any) => {
    const coverNames: Record<string, string> = { SKC: 'Sky Clear', CLR: 'Clear', FEW: 'Few', SCT: 'Scattered', BKN: 'Broken', OVC: 'Overcast', VV: 'Vertical Vis' };
    const name = coverNames[c.cover] || c.cover;
    const base = c.base != null ? ` at ${c.base.toLocaleString()}ft` : '';
    const type = c.type === 'CB' ? ' (Cumulonimbus)' : c.type === 'TCU' ? ' (Towering Cu)' : '';
    return `${name}${base}${type}`;
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] text-slate-500 font-medium uppercase tracking-wider">
          {isTaf ? `TAF Forecast · ${tafData.icao}` : 'Forecast Trend'}
        </span>
        {isTaf && tafData.validTo && (
          <span className="text-[8px] text-slate-600">
            Valid thru {new Date(tafData.validTo).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' })}
          </span>
        )}
      </div>
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-1 min-w-max px-1">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => item.period ? setExpandedPeriod(expandedPeriod === i ? null : i) : null}
              className={`flex flex-col items-center px-1.5 py-1 rounded-lg min-w-[42px] transition-colors ${
                expandedPeriod === i ? 'bg-blue-600/30 border border-blue-500/40' :
                item.period ? 'bg-slate-700/20 hover:bg-slate-700/40 cursor-pointer' : 'bg-slate-700/20'
              }`}
            >
              <span className="text-[8px] text-slate-500 uppercase font-mono">{item.zuluLabel}</span>
              {item.localLabel && <span className="text-[7px] text-slate-600">{item.localLabel}</span>}
              <span className="text-base my-0.5">{item.emoji}</span>
              {item.wxCodes && item.wxCodes.length > 0 && (
                <span className="text-[7px] text-amber-400 font-mono">{item.wxCodes.join(' ')}</span>
              )}
              {item.detail && <span className="text-[8px] text-slate-400 font-mono">{item.detail}</span>}
            </button>
          ))}
        </div>
      </div>

      {expandedPeriod != null && items[expandedPeriod]?.period && (() => {
        const p = items[expandedPeriod].period;
        const fromDate = p.from ? new Date(p.from) : null;
        const toDate = p.to ? new Date(p.to) : null;
        const changeLabels: Record<string, string> = { FM: 'From', TEMPO: 'Temporary', BECMG: 'Becoming', PROB30: 'Prob 30%', PROB40: 'Prob 40%' };
        return (
          <div className="mt-2 rounded-lg bg-slate-700/30 border border-slate-600/30 p-2.5 text-xs animate-fadeIn">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-300 font-semibold text-[11px]">
                {changeLabels[p.changeType] || p.changeType || 'Base'} Period
              </span>
              <button onClick={() => setExpandedPeriod(null)} className="text-slate-500 hover:text-slate-300 text-[10px]">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              <div className="text-slate-500">From</div>
              <div className="text-slate-300">
                {fromDate ? `${fromDate.getUTCHours().toString().padStart(2,'0')}${fromDate.getUTCMinutes().toString().padStart(2,'0')}Z (${fromDate.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true })})` : '—'}
              </div>
              <div className="text-slate-500">To</div>
              <div className="text-slate-300">
                {toDate ? `${toDate.getUTCHours().toString().padStart(2,'0')}${toDate.getUTCMinutes().toString().padStart(2,'0')}Z (${toDate.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true })})` : '—'}
              </div>
              <div className="text-slate-500">Condition</div>
              <div className="text-slate-300">{p.condition || 'Clear'}</div>
              {p.windSpeedKts != null && (
                <>
                  <div className="text-slate-500">Wind</div>
                  <div className="text-slate-300">
                    {p.windDir || 'VRB'}° at {p.windSpeedKts} kt ({Math.round(p.windSpeedKts * 1.15078)} mph)
                    {p.windGustKts ? `, gusting ${p.windGustKts} kt (${Math.round(p.windGustKts * 1.15078)} mph)` : ''}
                  </div>
                </>
              )}
              {p.visibilitySM != null && (
                <>
                  <div className="text-slate-500">Visibility</div>
                  <div className="text-slate-300">{p.visibilitySM >= 6 ? '6+ SM (Good)' : `${p.visibilitySM} SM`}</div>
                </>
              )}
              {p.clouds?.length > 0 && (
                <>
                  <div className="text-slate-500">Clouds</div>
                  <div className="text-slate-300">{p.clouds.map(formatCloudLayer).join(', ')}</div>
                </>
              )}
              {p.wxCodes?.length > 0 && (
                <>
                  <div className="text-slate-500">Weather</div>
                  <div className="text-amber-400 font-mono">{p.wxCodes.join(' ')}</div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function AlertTicker({ lat, lon, icao, windUnit }: { lat: number; lon: number; icao?: string; windUnit?: WindUnit }) {
  const { data: nwsData } = useQuery<any>({
    queryKey: ['/api/nws-alerts', lat, lon],
    queryFn: async () => { const r = await fetch(`/api/nws-alerts?lat=${lat}&lon=${lon}`); if (!r.ok) return { alerts: [] }; return r.json(); },
    staleTime: 120000,
  });

  const { data: tafData } = useQuery<any>({
    queryKey: ['/api/taf', icao],
    queryFn: async () => { const r = await fetch(`/api/taf/${icao}`); if (!r.ok) throw new Error('fail'); return r.json(); },
    enabled: !!icao,
    staleTime: 600000,
  });

  const { data: forecastData } = useQuery<any>({
    queryKey: ['/api/weather-forecast', lat, lon],
    queryFn: async () => { const r = await fetch(`/api/weather-forecast?lat=${lat}&lon=${lon}`); if (!r.ok) throw new Error('fail'); return r.json(); },
    staleTime: 300000,
  });

  const formatWindForUnit = (kts: number, gustKts?: number | null) => {
    const bft = (k: number) => {
      if (k < 1) return 0; if (k <= 3) return 1; if (k <= 6) return 2; if (k <= 10) return 3;
      if (k <= 16) return 4; if (k <= 21) return 5; if (k <= 27) return 6; if (k <= 33) return 7;
      if (k <= 40) return 8; if (k <= 47) return 9; if (k <= 55) return 10; if (k <= 63) return 11;
      return 12;
    };
    const u = windUnit || 'kts';
    const convert = (k: number) => {
      switch (u) {
        case 'mph': return `${Math.round(k * 1.15078)} mph`;
        case 'kts': return `${k}kt`;
        case 'kmh': return `${Math.round(k * 1.852)} km/h`;
        case 'ms': return `${(k * 0.51444).toFixed(1)} m/s`;
        case 'beaufort': return `Bft ${bft(k)}`;
      }
    };
    let str = convert(kts);
    if (gustKts != null) str += ` G${convert(gustKts)}`;
    return str;
  };

  const allMessages: string[] = [];

  const nwsAlerts = nwsData?.alerts || [];
  nwsAlerts.forEach((a: any) => {
    allMessages.push(`🚨 ${a.event}: ${a.headline || a.areaDesc}`);
  });

  if (tafData?.periods?.length > 0) {
    const now = new Date();
    tafData.periods.forEach((p: any) => {
      if (!p.from) return;
      const fromDate = new Date(p.from);
      const toDate = p.to ? new Date(p.to) : null;
      if (toDate && toDate < now) return;

      const zuluH = fromDate.getUTCHours().toString().padStart(2, '0');
      const zuluM = fromDate.getUTCMinutes().toString().padStart(2, '0');
      const localStr = fromDate.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '');
      const timeLabel = fromDate <= now ? 'Now' : `${zuluH}${zuluM}Z (${localStr})`;
      const prefix = p.changeType === 'TEMPO' ? 'TEMPO ' : p.changeType === 'BECMG' ? 'BECMG ' : '';

      const parts: string[] = [];
      parts.push(p.condition || 'Clear');
      if (p.windSpeedKts != null) {
        parts.push(`${p.windDir || 'VRB'}° @ ${formatWindForUnit(p.windSpeedKts, p.windGustKts)}`);
      }
      if (p.visibilitySM != null && p.visibilitySM < 6) parts.push(`Vis ${p.visibilitySM}SM`);
      if (p.wxCodes?.length > 0) parts.push(p.wxCodes.join(' '));
      if (p.clouds?.length > 0) {
        const sigCloud = p.clouds.find((c: any) => c.cover === 'BKN' || c.cover === 'OVC' || c.cover === 'VV');
        if (sigCloud) parts.push(`${sigCloud.cover} ${sigCloud.base ? Math.round(sigCloud.base / 100) * 100 + 'ft' : ''}`);
      }

      const emoji = /thunder/i.test(p.condition) ? '⛈️' :
        /rain|shower/i.test(p.condition) ? '🌧️' :
        /snow/i.test(p.condition) ? '🌨️' :
        /fog/i.test(p.condition) ? '🌫️' :
        /overcast/i.test(p.condition) ? '☁️' :
        /cloudy/i.test(p.condition) ? '⛅' :
        p.windSpeedKts >= 20 ? '💨' :
        /clear/i.test(p.condition) ? '☀️' : '🌤️';
      allMessages.push(`${emoji} ${prefix}${timeLabel}: ${parts.join(' · ')}`);
    });
  }

  if (allMessages.length === 0) {
    const forecast = forecastData?.forecast || [];
    const nwsPeriods = forecastData?.nws_periods || [];
    if (nwsPeriods.length > 0) {
      nwsPeriods.slice(0, 4).forEach((p: any) => {
        const emoji = /thunder|tstorm/i.test(p.shortForecast) ? '⛈️' :
          /rain|shower/i.test(p.shortForecast) ? '🌧️' :
          /snow/i.test(p.shortForecast) ? '🌨️' :
          /cloud/i.test(p.shortForecast) ? '⛅' : '🌤️';
        allMessages.push(`${emoji} ${p.name}: ${p.shortForecast}, ${p.temperature_f}°F`);
      });
    } else if (forecast.length > 0) {
      forecast.slice(0, 3).forEach((f: any, i: number) => {
        const d = new Date(f.date + 'T12:00:00');
        const name = i === 0 ? 'Today' : d.toLocaleDateString('en', { weekday: 'long' });
        const cond = f.day?.condition || 'Clear';
        const hi = Math.round(f.day?.maxtemp_f || 0);
        const lo = Math.round(f.night?.mintemp_f || f.day?.mintemp_f || 0);
        const rain = f.day?.daily_chance_of_rain || 0;
        const emoji = /thunder/i.test(cond) ? '⛈️' : /rain/i.test(cond) ? '🌧️' : /cloud/i.test(cond) ? '⛅' : '🌤️';
        allMessages.push(`${emoji} ${name}: ${cond}, Hi ${hi}°F/Lo ${lo}°F${rain > 0 ? ` (${rain}% rain)` : ''}`);
      });
    }
  }

  if (allMessages.length === 0) allMessages.push('✅ No active alerts — Conditions clear');

  return (
    <div className="overflow-hidden bg-slate-800/50 rounded-lg border border-slate-700/30">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-slate-700/20 bg-slate-700/30">
        <Radio className="w-3 h-3 text-green-400 animate-pulse" />
        <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
          {nwsAlerts.length > 0 ? 'Active Alerts' : tafData?.periods?.length > 0 ? `TAF Outlook · ${icao}` : 'Forecast Outlook'}
        </span>
      </div>
      <div className="overflow-hidden relative h-6 flex items-center">
        <div className="animate-ticker flex whitespace-nowrap">
          {[...allMessages, ...allMessages].map((msg, i) => (
            <span key={i} className="text-[11px] text-slate-300 mx-8 inline-block">{msg}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetarDecoder({ decoded }: { decoded: StationData['decoded'] }) {
  const [expanded, setExpanded] = useState(false);
  if (!decoded || decoded.length === 0) return null;

  const severityItems = decoded.filter(d => d.severity);
  const display = expanded ? decoded : severityItems.length > 0 ? severityItems : decoded.slice(0, 3);

  return (
    <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700/20 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm">📋</span>
          <span className="text-[10px] text-slate-400 uppercase font-semibold">METAR Decoded</span>
          {severityItems.length > 0 && (
            <Badge className="text-[8px] px-1 py-0 h-3.5 bg-red-900/30 text-red-400 border-red-600/30">
              {severityItems.length} alert{severityItems.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      <div className="px-3 pb-2 space-y-1">
        {display.map((item, i) => (
          <div key={i} className={`flex gap-2 text-[11px] px-2 py-1 rounded-md ${
            item.severity === 'danger' ? 'bg-red-900/20 border border-red-600/30' :
            item.severity === 'warning' ? 'bg-amber-900/20 border border-amber-600/30' :
            'bg-slate-700/10'
          }`}>
            <span className={`font-semibold shrink-0 w-28 ${
              item.severity === 'danger' ? 'text-red-400' :
              item.severity === 'warning' ? 'text-amber-400' :
              'text-slate-500'
            }`}>{item.label}</span>
            <span className={`${
              item.severity === 'danger' ? 'text-red-300' :
              item.severity === 'warning' ? 'text-amber-300' :
              'text-slate-300'
            }`}>{item.value}</span>
          </div>
        ))}
        {!expanded && decoded.length > display.length && (
          <span className="text-[9px] text-slate-600 block text-center">Tap to see all {decoded.length} decoded fields</span>
        )}
      </div>
    </div>
  );
}

export default function WeatherStationConsole({ lat, lon, locationName }: { lat: number; lon: number; locationName: string }) {
  const { t } = useLanguage();
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [showStationPicker, setShowStationPicker] = useState(false);
  const [searchIcao, setSearchIcao] = useState('');

  const [windUnit, cycleWind] = useCycleUnit<WindUnit>('wind', ['mph', 'kts', 'kmh', 'ms', 'beaufort']);
  const [tempUnit, cycleTemp] = useCycleUnit<TempUnit>('temp', ['f', 'c']);
  const [pressUnit, cyclePress] = useCycleUnit<PressureUnit>('pressure', ['inHg', 'mb', 'mmHg', 'kPa']);
  const [visUnit, cycleVis] = useCycleUnit<VisUnit>('visibility', ['mi', 'km', 'm', 'nm']);

  const { data: nearbyData } = useQuery<{ stations: NearbyStation[]; count: number }>({
    queryKey: ['/api/nearby-stations', lat, lon],
    queryFn: async () => {
      const r = await fetch(`/api/nearby-stations?lat=${lat}&lon=${lon}&radius=2`);
      if (!r.ok) throw new Error('Failed to fetch nearby stations');
      return r.json();
    },
    staleTime: 600000,
  });

  const { data: favorites } = useQuery<FavoriteStation[]>({
    queryKey: ['/api/favorite-stations'],
  });

  const stations = nearbyData?.stations || [];

  useEffect(() => {
    if (!selectedStation && stations.length > 0) {
      const saved = localStorage.getItem('stormtracker_selected_station');
      if (saved && stations.find(s => s.icao === saved)) setSelectedStation(saved);
      else setSelectedStation(stations[0].icao);
    }
  }, [stations, selectedStation]);

  const activeIcao = selectedStation || stations[0]?.icao;

  const { data: stationData, isLoading, isError, refetch } = useQuery<StationData>({
    queryKey: ['/api/station-data', activeIcao],
    queryFn: async () => {
      const r = await fetch(`/api/station-data/${activeIcao}`);
      if (!r.ok) throw new Error(`Station ${activeIcao} not found`);
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
    enabled: !!activeIcao,
    refetchInterval: 120000,
    staleTime: 60000,
    retry: 1,
  });

  const addFavorite = useMutation({
    mutationFn: (station: NearbyStation) => apiRequest('POST', '/api/favorite-stations', { icao: station.icao, name: station.name, lat: station.lat, lon: station.lon }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/favorite-stations'] }),
  });

  const removeFavorite = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/favorite-stations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/favorite-stations'] }),
  });

  const selectStation = useCallback((icao: string) => {
    setSelectedStation(icao);
    localStorage.setItem('stormtracker_selected_station', icao);
    setShowStationPicker(false);
  }, []);

  const handleSearchStation = useCallback(() => {
    if (searchIcao.trim().length >= 3) {
      selectStation(searchIcao.trim().toUpperCase());
      setSearchIcao('');
    }
  }, [searchIcao, selectStation]);

  const isFavorite = favorites?.find(f => f.icao === activeIcao);
  const activeStationInfo = stations.find(s => s.icao === activeIcao);
  const obsAge = stationData?.obsTime ? Math.round((Date.now() - (typeof stationData.obsTime === 'number' && stationData.obsTime < 1e12 ? stationData.obsTime * 1000 : new Date(stationData.obsTime).getTime())) / 60000) : null;

  const uvIndex = useMemo(() => {
    if (!stationData?.tempF) return null;
    const hour = new Date().getHours();
    if (hour < 6 || hour > 20) return 0;
    return hour >= 10 && hour <= 14 ? 8 : hour >= 8 && hour <= 16 ? 5 : 2;
  }, [stationData]);

  const getTempDisplay = (f: number | null, c: number | null) => {
    if (tempUnit === 'c') return { val: c, unit: '°C', alt: f != null ? `${f}°F` : '' };
    return { val: f, unit: '°F', alt: c != null ? `${c}°C` : '' };
  };

  const getPressDisplay = (p: StationData['pressure']) => {
    switch (pressUnit) {
      case 'inHg': return { val: p.inHg, unit: 'inHg' };
      case 'mb': return { val: p.mb, unit: 'mb' };
      case 'mmHg': return { val: p.mmHg, unit: 'mmHg' };
      case 'kPa': return { val: p.kPa, unit: 'kPa' };
    }
  };

  const getVisDisplay = (v: StationData['visibility']) => {
    if (!v) return { val: null, unit: '--', max: 10 };
    switch (visUnit) {
      case 'mi': return { val: v.miles, unit: 'mi', max: 10 };
      case 'km': return { val: v.km, unit: 'km', max: 16 };
      case 'm': return { val: v.meters, unit: 'm', max: 16000 };
      case 'nm': return { val: v.nauticalMiles, unit: 'NM', max: 10 };
    }
  };

  const wxDescription = useMemo(() => {
    if (!stationData?.wxString) return null;
    const wx: Record<string, string> = {
      'RA': 'Rain', 'SN': 'Snow', 'DZ': 'Drizzle', 'TS': 'Thunderstorm',
      'FG': 'Fog', 'BR': 'Mist', 'HZ': 'Haze', 'FU': 'Smoke',
      'GR': 'Hail', 'GS': 'Small Hail', 'PE': 'Ice Pellets', 'PL': 'Ice Pellets',
      'SH': 'Showers', 'FZ': 'Freezing', 'VA': 'Volcanic Ash', 'DU': 'Dust',
      'SA': 'Sand', 'SQ': 'Squall', 'FC': 'Tornado',
    };
    let desc = stationData.wxString;
    const intensity = desc.startsWith('+') ? 'Heavy ' : desc.startsWith('-') ? 'Light ' : '';
    desc = desc.replace(/^[+-]/, '');
    const parts = desc.match(/.{2}/g) || [];
    return intensity + parts.map(p => wx[p] || p).join(' ');
  }, [stationData?.wxString]);

  if (!activeIcao && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <Radio className="w-8 h-8 mb-2 opacity-50" />
        <span className="text-sm">No weather stations found nearby</span>
        <span className="text-xs mt-1">Try expanding the search radius</span>
      </div>
    );
  }

  const nextTemp = tempUnit === 'f' ? '°C' : '°F';
  const nextPress: Record<PressureUnit, string> = { inHg: 'mb', mb: 'mmHg', mmHg: 'kPa', kPa: 'inHg' };
  const nextVis: Record<VisUnit, string> = { mi: 'km', km: 'meters', m: 'NM', nm: 'miles' };

  return (
    <div className="space-y-3 pb-20">
      <style>{`
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-ticker { animation: ticker 30s linear infinite; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-green-400" />
          <span className="text-sm font-bold text-white">Weather Station</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => refetch()} className="p-1.5 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => isFavorite ? removeFavorite.mutate(isFavorite.id) : activeStationInfo && addFavorite.mutate(activeStationInfo)}
            className="p-1.5 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors"
          >
            <Star className={`w-3.5 h-3.5 ${isFavorite ? 'text-yellow-400 fill-yellow-400' : 'text-slate-400'}`} />
          </button>
        </div>
      </div>

      <button onClick={() => setShowStationPicker(!showStationPicker)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-700/30 border border-slate-600/30 hover:bg-slate-700/50 transition-colors">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-green-400" />
          <div className="text-left">
            <span className="text-white text-xs font-semibold block">{stationData?.name || activeIcao}</span>
            <span className="text-slate-500 text-[9px]">{activeIcao} {activeStationInfo ? `• ${activeStationInfo.distance} mi away` : ''} {stationData?.elev ? `• ${Math.round(stationData.elev)}m elev` : ''}</span>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showStationPicker ? 'rotate-180' : ''}`} />
      </button>

      {showStationPicker && (
        <div className="rounded-xl border border-slate-600/30 bg-slate-800/80 overflow-hidden">
          <div className="flex gap-1.5 p-2 border-b border-slate-700/30">
            <Input value={searchIcao} onChange={(e) => setSearchIcao(e.target.value.toUpperCase())}
              placeholder="Enter ICAO code (e.g. KJFK)"
              className="h-7 text-xs bg-slate-700/30 border-slate-600/30"
              onKeyDown={(e) => e.key === 'Enter' && handleSearchStation()} />
            <button onClick={handleSearchStation} className="px-2 rounded-lg bg-green-600/20 hover:bg-green-600/30 text-green-400">
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
          {(favorites || []).length > 0 && (
            <div className="px-2 pt-1.5 pb-1">
              <span className="text-[9px] text-yellow-400 uppercase font-semibold">★ Favorites</span>
              {favorites!.map(f => (
                <button key={`fav-${f.id}`} onClick={() => selectStation(f.icao)}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-700/30 text-left ${f.icao === activeIcao ? 'bg-green-900/20' : ''}`}>
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />
                  <span className="text-white text-[11px]">{f.icao}</span>
                  <span className="text-slate-500 text-[10px] truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="px-2 pt-1.5 pb-2 max-h-48 overflow-y-auto">
            <span className="text-[9px] text-slate-500 uppercase font-semibold">Nearby Stations</span>
            {stations.map(s => (
              <button key={s.icao} onClick={() => selectStation(s.icao)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700/30 text-left ${s.icao === activeIcao ? 'bg-green-900/20' : ''}`}>
                <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="text-white text-[11px] font-medium">{s.icao}</span>
                <span className="text-slate-500 text-[10px] truncate flex-1">{s.name}</span>
                <span className="text-slate-600 text-[9px] shrink-0">{s.distance} mi</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {stationData && (
        <>
          {obsAge != null && (
            <div className="flex items-center justify-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${obsAge < 30 ? 'bg-green-400 animate-pulse' : obsAge < 60 ? 'bg-yellow-400' : 'bg-red-400'}`} />
              <span className="text-[9px] text-slate-500">
                {obsAge < 2 ? 'Live' : `Updated ${obsAge} min ago`}
              </span>
              <span className="text-[8px] text-slate-600 ml-2">Tap values to change units ⟳</span>
            </div>
          )}

          <AlertTicker lat={lat} lon={lon} icao={stationData.icao} windUnit={windUnit} />

          {wxDescription && (
            <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-900/15 border border-amber-600/30">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-300 text-xs font-medium">{wxDescription}</span>
            </div>
          )}

          <MetarDecoder decoded={stationData.decoded} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-2 flex justify-center rounded-xl bg-slate-800/40 border border-slate-700/20 p-3">
              <WindCompass wind={stationData.wind} windUnit={windUnit} cycleWind={cycleWind} />
            </div>

            <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-3 flex flex-col items-center justify-center">
              <Thermometer className="w-5 h-5 text-red-400 mb-1" />
              <span className="text-[9px] text-slate-500 uppercase">Temperature</span>
              <TappableValue onClick={cycleTemp} hint={nextTemp}>
                <div className="text-center">
                  <span className="text-white font-bold text-2xl">{getTempDisplay(stationData.tempF, stationData.tempC).val ?? '--'}</span>
                  <span className="text-slate-400 text-sm">{getTempDisplay(stationData.tempF, stationData.tempC).unit}</span>
                </div>
              </TappableValue>
              <span className="text-slate-500 text-[10px]">{getTempDisplay(stationData.tempF, stationData.tempC).alt}</span>
              {stationData.feelsLike && (
                <div className="mt-1 text-center">
                  <span className="text-[9px] text-slate-500 uppercase block">
                    {stationData.feelsLike.type === 'windchill' ? 'Wind Chill' : stationData.feelsLike.type === 'heatindex' ? 'Heat Index' : 'Feels Like'}
                  </span>
                  <TappableValue onClick={cycleTemp} hint={nextTemp}>
                    <span className="text-slate-300 text-xs font-semibold">
                      {tempUnit === 'f' ? `${stationData.feelsLike.f}°F` : `${stationData.feelsLike.c}°C`}
                    </span>
                  </TappableValue>
                  <span className="text-slate-500 text-[10px] ml-1">
                    ({tempUnit === 'f' ? `${stationData.feelsLike.c}°C` : `${stationData.feelsLike.f}°F`})
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-3 flex flex-col items-center justify-center">
              <Droplets className="w-5 h-5 text-blue-400 mb-1" />
              <span className="text-[9px] text-slate-500 uppercase">Dew Point</span>
              <TappableValue onClick={cycleTemp} hint={nextTemp}>
                <div className="text-center">
                  <span className="text-white font-bold text-lg">{getTempDisplay(stationData.dewF, stationData.dewC).val ?? '--'}</span>
                  <span className="text-slate-400 text-xs">{getTempDisplay(stationData.dewF, stationData.dewC).unit}</span>
                </div>
              </TappableValue>
              <span className="text-slate-500 text-[10px]">{getTempDisplay(stationData.dewF, stationData.dewC).alt}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <CircularGauge value={stationData.humidity} max={100} label="Humidity" unit="%" color="#3b82f6" icon="💧" />
            {(() => {
              const vis = getVisDisplay(stationData.visibility);
              return (
                <CircularGauge value={vis.val} max={vis.max} label="Visibility" unit={vis.unit} color="#a78bfa" icon="👁️"
                  onClick={cycleVis} hint={nextVis[visUnit]} />
              );
            })()}
            <CircularGauge value={uvIndex} max={11} label="UV Index" unit="" color={uvIndex != null && uvIndex >= 8 ? '#ef4444' : uvIndex != null && uvIndex >= 6 ? '#f97316' : '#22c55e'} icon="☀️" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🌡️</span>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Barometer</span>
                <PressureTrendIcon trend={stationData.pressure.trend} />
              </div>
              <TappableValue onClick={cyclePress} hint={nextPress[pressUnit]}>
                <div className="text-center w-full">
                  {(() => {
                    const pd = getPressDisplay(stationData.pressure);
                    return (
                      <>
                        <span className="text-white font-bold text-xl">{pd.val ?? '--'}</span>
                        <span className="text-slate-400 text-xs"> {pd.unit}</span>
                      </>
                    );
                  })()}
                </div>
              </TappableValue>
              <div className="text-center mt-1">
                {pressUnit !== 'mb' && stationData.pressure.mb && (
                  <span className="text-slate-500 text-[10px] block">{stationData.pressure.mb} mb</span>
                )}
                {pressUnit !== 'inHg' && stationData.pressure.inHg && (
                  <span className="text-slate-500 text-[10px] block">{stationData.pressure.inHg} inHg</span>
                )}
              </div>
              <div className="text-center mt-1">
                <Badge className={`text-[8px] px-1.5 py-0 h-4 ${
                  stationData.pressure.trend === 'rising' ? 'bg-green-900/30 text-green-400' :
                  stationData.pressure.trend === 'falling' ? 'bg-red-900/30 text-red-400' :
                  'bg-slate-700/30 text-slate-400'
                }`}>
                  {stationData.pressure.trend === 'rising' ? '↑ Rising' :
                   stationData.pressure.trend === 'falling' ? '↓ Falling' :
                   stationData.pressure.trend === 'steady' ? '→ Steady' : '-- Unknown'}
                </Badge>
              </div>
            </div>

            <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🌧️</span>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Precipitation</span>
              </div>
              <div className="text-center">
                <span className="text-blue-400 font-bold text-xl">{stationData.precip ? stationData.precip.toFixed(2) : '0.00'}</span>
                <span className="text-slate-400 text-xs"> in</span>
              </div>
              {stationData.precip != null && stationData.precip > 0 && (
                <div className="text-center">
                  <span className="text-slate-500 text-[10px]">{(stationData.precip * 25.4).toFixed(1)} mm</span>
                </div>
              )}
              <span className="text-[9px] text-slate-500 block text-center mt-0.5">Accumulation</span>
              {stationData.clouds && stationData.clouds.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  <span className="text-[9px] text-slate-500 uppercase block">Cloud Cover</span>
                  {stationData.clouds.map((c: any, i: number) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-slate-400">{c.cover}</span>
                      <span className="text-slate-500">{c.base ? `${c.base} ft` : ''}{c.base ? ` (${Math.round(c.base * 0.3048)}m)` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{stationData.moonPhase.icon}</span>
                <div>
                  <span className="text-white text-xs font-semibold block">{stationData.moonPhase.name}</span>
                  <span className="text-slate-500 text-[9px]">{stationData.moonPhase.illumination}% illuminated</span>
                </div>
              </div>
              <span className="text-[9px] text-slate-600">Day {stationData.moonPhase.age} of 29</span>
            </div>
          </div>

          <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-3">
            <ForecastIconStrip lat={lat} lon={lon} icao={stationData.icao} />
          </div>

          <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-2">
            <details>
              <summary className="text-[9px] text-slate-500 cursor-pointer hover:text-slate-400">Raw METAR</summary>
              <code className="text-[9px] text-green-400 block mt-1 font-mono break-all">{stationData.rawOb}</code>
            </details>
          </div>
        </>
      )}

      {isError && !stationData && (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500">
          <AlertTriangle className="w-6 h-6 text-amber-400 mb-2" />
          <span className="text-sm text-amber-300">Station data unavailable</span>
          <span className="text-xs mt-1">Check the ICAO code or try another station</span>
          <button onClick={() => refetch()} className="mt-3 px-3 py-1 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 text-xs text-slate-400">Retry</button>
        </div>
      )}

      {isLoading && !stationData && !isError && (
        <div className="space-y-3 animate-pulse">
          <div className="flex items-center justify-center gap-1.5 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-pulse" />
            <span className="text-[9px] text-slate-600">Loading station data…</span>
          </div>
          <div className="rounded-lg bg-slate-800/50 border border-slate-700/30 h-6" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-2 rounded-xl bg-slate-800/40 border border-slate-700/20 p-3 flex justify-center">
              <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-slate-700/15 border-2 border-slate-700/30 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-slate-700/20" />
              </div>
            </div>
            <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-3">
              <div className="h-4 bg-slate-700/30 rounded w-16 mx-auto mb-2" />
              <div className="h-8 bg-slate-700/25 rounded w-12 mx-auto mb-1" />
              <div className="h-3 bg-slate-700/15 rounded w-10 mx-auto" />
            </div>
            <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-3">
              <div className="h-4 bg-slate-700/30 rounded w-14 mx-auto mb-2" />
              <div className="h-6 bg-slate-700/25 rounded w-10 mx-auto mb-1" />
              <div className="h-3 bg-slate-700/15 rounded w-10 mx-auto" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex flex-col items-center">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-slate-700/15 border-4 border-slate-700/20" />
                <div className="h-2.5 bg-slate-700/20 rounded w-14 mt-2" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-3 h-28" />
            <div className="rounded-xl bg-slate-800/40 border border-slate-700/20 p-3 h-28" />
          </div>
        </div>
      )}
    </div>
  );
}
