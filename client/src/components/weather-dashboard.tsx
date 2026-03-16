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
import { useLanguage } from "@/hooks/use-language";
import { translateWeatherText } from "@/lib/i18n";

interface WeatherDashboardProps {
  lat: number;
  lon: number;
  useMetric: boolean;
  locationName: string;
}

const DAY_NAMES: Record<string, string[]> = {
  en: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  es: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],
  fr: ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'],
  de: ['So','Mo','Di','Mi','Do','Fr','Sa'],
  pt: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],
  ja: ['日','月','火','水','木','金','土'],
  ko: ['일','월','화','수','목','금','토'],
  zh: ['日','一','二','三','四','五','六'],
  ar: ['أحد','إثن','ثلا','أرب','خمي','جمع','سبت'],
  hi: ['रवि','सोम','मंग','बुध','गुरु','शुक्र','शनि'],
  id: ['Min','Sen','Sel','Rab','Kam','Jum','Sab'],
  th: ['อา','จ','อ','พ','พฤ','ศ','ส'],
  vi: ['CN','T2','T3','T4','T5','T6','T7'],
  tr: ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'],
  it: ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'],
  nl: ['Zo','Ma','Di','Wo','Do','Vr','Za'],
  ru: ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'],
  pl: ['Nd','Pn','Wt','Śr','Cz','Pt','Sb'],
  ms: ['Ahd','Isn','Sel','Rab','Kha','Jum','Sab'],
  sw: ['Jpi','Jtt','Jnn','Jtn','Alh','Iju','Jms'],
};

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
  const { t, language } = useLanguage();
  const isNight = !period.isDaytime;
  const tempLabel = isNight ? t.minTemp : t.maxTemp;

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
            <span className="text-white font-semibold text-sm">{translateWeatherText(period.name, language)}</span>
            {period.hasAdvisory && (
              <Badge className="bg-amber-600 text-white text-[9px] px-1.5 py-0 h-4 uppercase font-bold">{t.advisory}</Badge>
            )}
            <span className="text-[11px] text-slate-400">
              {isNight ? '🌙' : '☀️'} {tempLabel}: {period.temperature_f}°F ({period.temperature_c}°C)
            </span>
          </div>
          <p className="text-slate-300 text-xs mt-0.5">{translateWeatherText(period.shortForecast, language)}</p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 flex-wrap">
            <span>{t.wind}: {period.windSpeed} {period.windDirection}</span>
            {period.precipChance > 0 && (
              <span className="text-blue-400">💧 {period.precipChance}%</span>
            )}
          </div>
          {period.weatherTags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {Array.from(new Set(period.weatherTags)).map((h: string, i: number) => (
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
            {showDetail ? t.showLess : t.showDetails}
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

function ForecastDayCard({ dayLabel, dayHalf, nightHalf, accuweather, hasAdvisory }: {
  dayLabel: string;
  dayHalf?: { icon: string; tempF: number; tempC: number; forecast: string; wind: string; precipChance: number; detailedForecast?: string; weatherTags?: string[] };
  nightHalf?: { icon: string; tempF: number; tempC: number; forecast: string; wind: string; precipChance: number; detailedForecast?: string; weatherTags?: string[] };
  accuweather?: { thunderstormProbability?: number; shortPhrase?: string };
  hasAdvisory?: boolean;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const { t, language } = useLanguage();

  const hasDetails = !!(dayHalf?.detailedForecast || nightHalf?.detailedForecast);
  const allTags = Array.from(new Set([...(dayHalf?.weatherTags || []), ...(nightHalf?.weatherTags || [])]));

  return (
    <div className={`rounded-xl border overflow-hidden ${
      hasAdvisory ? 'bg-amber-900/15 border-amber-600/40' : 'bg-slate-700/20 border-slate-600/30'
    }`}>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/30 border-b border-slate-600/20">
        <span className="text-white font-semibold text-[12px]">{translateWeatherText(dayLabel, language)}</span>
        {hasAdvisory && (
          <Badge className="bg-amber-600 text-white text-[8px] px-1 py-0 h-3.5 uppercase font-bold">{t.advisory}</Badge>
        )}
        {accuweather?.thunderstormProbability != null && accuweather.thunderstormProbability > 0 && (
          <span className="text-orange-400 text-[10px] ml-auto">⛈ {accuweather.thunderstormProbability}%</span>
        )}
      </div>

      <div className="grid grid-cols-2 divide-x divide-slate-600/20">
        {dayHalf ? (
          <div className="p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm">☀️</span>
              <span className="text-[10px] text-slate-400 font-medium">{t.day || 'Day'}</span>
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-base shrink-0">{dayHalf.icon}</span>
              <span className="text-white font-semibold text-[12px]">{dayHalf.tempF}°F</span>
              <span className="text-slate-500 text-[10px]">({dayHalf.tempC}°C)</span>
            </div>
            <p className="text-[10px] text-slate-300 mb-0.5">{translateWeatherText(dayHalf.forecast, language)}</p>
            <p className="text-[9px] text-slate-500">{t.wind}: {dayHalf.wind}</p>
            {dayHalf.precipChance > 0 && (
              <div className="flex items-center gap-0.5 mt-0.5">
                <Droplets className="w-2.5 h-2.5 text-blue-400" />
                <span className="text-blue-400 text-[9px]">{dayHalf.precipChance}%</span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-2.5 flex items-center justify-center">
            <span className="text-[10px] text-slate-600 italic">—</span>
          </div>
        )}

        {nightHalf ? (
          <div className="p-2.5 bg-slate-800/30">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm">🌙</span>
              <span className="text-[10px] text-slate-400 font-medium">{t.night || 'Night'}</span>
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-base shrink-0">{nightHalf.icon}</span>
              <span className="text-slate-300 font-semibold text-[12px]">{nightHalf.tempF}°F</span>
              <span className="text-slate-500 text-[10px]">({nightHalf.tempC}°C)</span>
            </div>
            <p className="text-[10px] text-slate-400 mb-0.5">{translateWeatherText(nightHalf.forecast, language)}</p>
            <p className="text-[9px] text-slate-500">{t.wind}: {nightHalf.wind}</p>
            {nightHalf.precipChance > 0 && (
              <div className="flex items-center gap-0.5 mt-0.5">
                <Droplets className="w-2.5 h-2.5 text-blue-400" />
                <span className="text-blue-400 text-[9px]">{nightHalf.precipChance}%</span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-2.5 bg-slate-800/30 flex items-center justify-center">
            <span className="text-[10px] text-slate-600 italic">—</span>
          </div>
        )}
      </div>

      {accuweather?.shortPhrase && (
        <div className="px-3 py-1 border-t border-slate-600/20">
          <span className="text-slate-500 text-[9px] italic">{accuweather.shortPhrase}</span>
        </div>
      )}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-1 border-t border-slate-600/20">
          {allTags.map((h: string, i: number) => (
            <span key={i} className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${getHazardColor(h)}`}>
              {h.charAt(0).toUpperCase() + h.slice(1)}
            </span>
          ))}
        </div>
      )}
      {hasDetails && (
        <div className="px-3 pb-2 border-t border-slate-600/20 pt-1">
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showDetail ? t.showLess : t.showDetails}
          </button>
          {showDetail && (
            <div className="mt-1 space-y-1.5">
              {dayHalf?.detailedForecast && (
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  <span className="text-slate-300 font-medium">☀️</span> {dayHalf.detailedForecast}
                </p>
              )}
              {nightHalf?.detailedForecast && (
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  <span className="text-slate-300 font-medium">🌙</span> {nightHalf.detailedForecast}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NWSAlertCard({ alert }: { alert: any }) {
  const [showDetail, setShowDetail] = useState(false);
  const { t, language } = useLanguage();
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
            <span className="text-amber-200 font-semibold text-sm">{translateWeatherText(alert.event, language)}</span>
            {alert.severity && (
              <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-400 px-1.5 py-0 h-4">
                {translateWeatherText(alert.severity, language)}
              </Badge>
            )}
          </div>
          {alert.senderName && (
            <p className="text-[11px] text-slate-400 mb-1">{alert.senderName}</p>
          )}
          {alert.expires && (
            <p className="text-[10px] text-slate-500 mb-1">
              {translateWeatherText('Expires', language)}: {new Date(alert.expires).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
          {alert.areaDesc && (
            <p className="text-[10px] text-slate-500 mb-1">{t.areas}: {alert.areaDesc}</p>
          )}
          {alert.instruction && (
            <div className="bg-amber-900/20 rounded-lg p-2 mt-1.5 border border-amber-700/30">
              <p className="text-[10px] text-amber-300 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <span><strong>{t.safetyInstructions}:</strong> {alert.instruction.substring(0, 300)}{alert.instruction.length > 300 ? '...' : ''}</span>
              </p>
            </div>
          )}
          {alert.description && (
            <>
              <button
                onClick={() => setShowDetail(!showDetail)}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors mt-1"
              >
                {showDetail ? t.showLess : t.showDetails}
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
  const { t, language } = useLanguage();

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
              <span className="text-sm">{t.weatherDataUnavailable}</span>
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
                <p className="text-xs sm:text-sm text-slate-300">{translateWeatherText(cur.condition, language)}</p>
                <span className="text-[10px] sm:text-xs text-slate-500 whitespace-nowrap">
                  {t.feelsLike} {dualTempF(cur.feelslike_f, cur.feelslike_c)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant="outline" className="text-[9px] border-slate-600 text-slate-400 hidden sm:flex px-1.5 h-5">
              {sourcesCount} {t.sources}
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
                  <p className="text-sm font-medium text-red-300">{translateWeatherText(alert.event || alert.headline, language)}</p>
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
            <div className="text-slate-400 text-[10px]">{t.humidity}</div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-2 text-center">
            <Wind className="w-3.5 h-3.5 mx-auto text-cyan-400 mb-0.5" />
            <div className="text-white font-semibold text-[11px] leading-tight">{dualWind(cur.wind_mph, cur.wind_kph)}</div>
            <div className="text-slate-400 text-[10px]">{cur.wind_dir} ({cur.wind_degree}°){cur.gust_mph > cur.wind_mph + 5 ? ` G${Math.round(cur.gust_mph)}` : ''}</div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-2 text-center">
            <Gauge className="w-3.5 h-3.5 mx-auto text-purple-400 mb-0.5" />
            <div className="text-white font-semibold text-[11px] leading-tight">{dualPressure(cur.pressure_in, cur.pressure_mb)}</div>
            <div className="text-slate-400 text-[10px]">{t.pressure}</div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-2 text-center">
            <Eye className="w-3.5 h-3.5 mx-auto text-green-400 mb-0.5" />
            <div className="text-white font-semibold text-[11px] leading-tight">{dualVis(cur.visibility_miles, cur.visibility_km)}</div>
            <div className="text-slate-400 text-[10px]">{t.visibility}</div>
          </div>
          {cur.dew_point_f != null && (
            <div className="bg-slate-700/30 rounded-lg p-2 text-center">
              <Thermometer className="w-3.5 h-3.5 mx-auto text-teal-400 mb-0.5" />
              <div className="text-white font-semibold text-[11px] leading-tight">{dualTempF(cur.dew_point_f, cur.dew_point_c)}</div>
              <div className="text-slate-400 text-[10px]">{t.dewPoint}</div>
            </div>
          )}
          <div className="bg-slate-700/30 rounded-lg p-2 text-center">
            <Cloud className="w-3.5 h-3.5 mx-auto text-slate-300 mb-0.5" />
            <div className="text-white font-semibold text-sm">{cur.cloud}%</div>
            <div className="text-slate-400 text-[10px]">{t.cloudCover}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
          {cur.uv !== undefined && cur.uv > 0 && (
            <span>{t.uvIndex}: <span className={getUVLabel(cur.uv).color}>{cur.uv} ({getUVLabel(cur.uv).label})</span></span>
          )}
          {airQuality?.us_epa_index && (
            <span>AQI: <span className={getAQILabel(airQuality.us_epa_index).color}>{getAQILabel(airQuality.us_epa_index).label}</span></span>
          )}
          {cur.precip_in > 0 && (
            <span>{t.precip}: {dualPrecip(cur.precip_in, cur.precip_mm)}</span>
          )}
        </div>

        {sourcesDetail.length > 1 && (
          <div>
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Database className="w-3 h-3" />
              <span>{t.hybrid}: {sourcesDetail.map((s: any) => s.name).join(' + ')}</span>
              {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showSources && (
              <div className="mt-2 space-y-1.5">
                <div className="text-[9px] text-slate-500 mb-1">{t.perSourceReadings}:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {sourcesDetail.map((src: any, i: number) => (
                    <div key={i} className={`bg-slate-700/20 rounded p-2 border ${getSourceColor(src.name)}`}>
                      <div className="text-[10px] font-semibold mb-1">{src.name}</div>
                      <div className="grid grid-cols-2 gap-x-2 text-[10px] text-slate-300">
                        <span>{t.temperature}: {Math.round(src.temp_f)}°F ({Math.round(src.temp_c)}°C)</span>
                        <span>{t.humidity}: {src.humidity}%</span>
                        <span>{t.wind}: {Math.round(src.wind_mph)} mph ({Math.round(src.wind_mph * 1.60934)} km/h)</span>
                        <span>{t.pressure}: {Math.round(src.pressure_mb)} mb</span>
                        <span className="col-span-2 text-slate-400 truncate">{src.condition}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {(nwsPeriods.length > 0 || forecast.length > 0) && (
          <>
            <Separator className="bg-slate-700" />
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Shield className="w-3 h-3" />
                {t.forecast}
              </h4>
              <div className="space-y-2">
                {(() => {
                  const localDays = DAY_NAMES[language] || DAY_NAMES.en;
                  const todayNames = ['Today', 'This Afternoon', 'This Morning', 'This Evening', 'Now', 'Rest of Today'];

                  const nwsPairs: Array<{ dayPeriod?: any; nightPeriod?: any; dayLabel: string }> = [];
                  if (nwsPeriods.length > 0) {
                    let currentPair: any = null;
                    for (const period of nwsPeriods) {
                      const isToday = todayNames.some(n => period.name?.includes(n));
                      if (period.isDaytime || (isToday && !currentPair)) {
                        if (currentPair) nwsPairs.push(currentPair);
                        const label = isToday ? t.today : period.name?.replace(' Night', '').replace(' Evening', '') || '';
                        currentPair = { dayPeriod: period, dayLabel: label };
                      } else if (period.name?.includes('Night') || period.name?.includes('Evening') || period.name === 'Tonight' || period.name === 'Overnight') {
                        if (!currentPair) {
                          currentPair = { dayLabel: period.name === 'Tonight' ? t.today : period.name?.replace(' Night', '').replace(' Evening', '') || '' };
                        }
                        currentPair.nightPeriod = period;
                      }
                    }
                    if (currentPair) nwsPairs.push(currentPair);
                  }

                  const makeDayHalf = (period: any) => period ? ({
                    icon: getConditionIcon(period.shortForecast),
                    tempF: period.temperature_f ?? 0,
                    tempC: period.temperature_c ?? 0,
                    forecast: period.shortForecast || '',
                    wind: `${period.windSpeed || ''} ${period.windDirection || ''}`.trim(),
                    precipChance: period.precipChance || 0,
                    detailedForecast: period.detailedForecast,
                    weatherTags: period.weatherTags || [],
                  }) : undefined;

                  const makeForecastHalves = (fc: any) => ({
                    dayHalf: {
                      icon: getConditionIcon(fc.day.condition),
                      tempF: Math.round(fc.day.maxtemp_f),
                      tempC: Math.round(fc.day.maxtemp_c),
                      forecast: fc.day.condition || '',
                      wind: `${Math.round(fc.day.maxwind_mph)} mph`,
                      precipChance: fc.day.daily_chance_of_rain || 0,
                      weatherTags: [] as string[],
                    },
                    nightHalf: {
                      icon: getConditionIcon(fc.day.condition),
                      tempF: Math.round(fc.day.mintemp_f),
                      tempC: Math.round(fc.day.mintemp_c),
                      forecast: fc.day.condition || '',
                      wind: '',
                      precipChance: 0,
                      weatherTags: [] as string[],
                    },
                  });

                  const cards: any[] = [];
                  const usedForecastIdx = new Set<number>();

                  if (nwsPairs.length > 0) {
                    nwsPairs.forEach((pair, pi) => {
                      let matchedFc: any = null;
                      const pairLabel = pair.dayLabel.toLowerCase().trim();
                      forecast.forEach((f: any, fi: number) => {
                        if (usedForecastIdx.has(fi) || matchedFc) return;
                        const d = new Date(f.date + 'T12:00:00');
                        const fDay = fi === 0 ? t.today.toLowerCase() : localDays[d.getDay()]?.toLowerCase();
                        if (fDay === pairLabel || (fi === 0 && pairLabel === t.today.toLowerCase())) {
                          matchedFc = f;
                          usedForecastIdx.add(fi);
                        }
                      });
                      if (!matchedFc && pi < forecast.length && !usedForecastIdx.has(pi)) {
                        matchedFc = forecast[pi];
                        usedForecastIdx.add(pi);
                      }

                      cards.push(
                        <ForecastDayCard
                          key={`nws-${pi}`}
                          dayLabel={pair.dayLabel}
                          dayHalf={makeDayHalf(pair.dayPeriod)}
                          nightHalf={makeDayHalf(pair.nightPeriod)}
                          accuweather={matchedFc?.accuweather}
                          hasAdvisory={pair.dayPeriod?.hasAdvisory || pair.nightPeriod?.hasAdvisory}
                        />
                      );
                    });
                  }

                  forecast.forEach((f: any, fi: number) => {
                    if (usedForecastIdx.has(fi)) return;
                    const d = new Date(f.date + 'T12:00:00');
                    const dayName = fi === 0 ? t.today : localDays[d.getDay()];
                    const halves = makeForecastHalves(f);
                    cards.push(
                      <ForecastDayCard
                        key={`fc-${fi}`}
                        dayLabel={dayName}
                        dayHalf={halves.dayHalf}
                        nightHalf={halves.nightHalf}
                        accuweather={f.accuweather}
                      />
                    );
                  });

                  return cards;
                })()}
              </div>
            </div>
          </>
        )}

        {expanded && forecast.length > 0 && (
          <>
            <Separator className="bg-slate-700" />
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t.sunriseSunset}</h4>
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
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t.airQuality}</h4>
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
                        <div className="text-slate-400 text-[10px]">{t.ozone}</div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {forecast[0]?.accuweather?.airAndPollen?.length > 0 && (
              <>
                <Separator className="bg-slate-700" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t.pollenAllergens}</h4>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {forecast[0].accuweather.airAndPollen
                      .filter((p: any) => p.Name !== 'AirQuality' && p.Name !== 'UVIndex')
                      .map((p: any, i: number) => (
                        <div key={i} className="bg-slate-700/30 rounded p-2 text-center">
                          <div className={`font-semibold ${
                            p.CategoryValue >= 4 ? 'text-red-400' :
                            p.CategoryValue >= 3 ? 'text-orange-400' :
                            p.CategoryValue >= 2 ? 'text-yellow-400' : 'text-green-400'
                          }`}>{p.Category}</div>
                          <div className="text-slate-400 text-[10px]">{p.Name}</div>
                        </div>
                      ))
                    }
                  </div>
                  <div className="text-slate-600 text-[8px] mt-1 text-right">via AccuWeather</div>
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
          {expanded ? t.showLess : t.showMore}
          {expanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
        </Button>

        <div className="text-[9px] text-slate-500 text-right">
          {t.sources}: {data.source || 'Weather API'} (Hybrid Averaged)
        </div>
      </CardContent>
    </Card>
  );
}
