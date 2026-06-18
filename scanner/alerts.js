// scanner/alerts.js — server-side parity for StormTracker's non-storm alerts so
// the background scanner can push EVERYTHING the app would alert on, not just
// inbound storm cells. Two keyless data sources (work inside GitHub Actions):
//   * Open-Meteo  -> current conditions for the weather threshold alerts
//                    (mirrors docs/js/thresholds.js _WX_ALERT_DEFS)
//   * api.weather.gov -> active NWS warnings at a point (US only)
//
// The weather threshold comparisons are ported verbatim from the in-app defs so
// background pushes match exactly what the app shows. The user's threshold
// VALUES + unit prefs travel in the subscription, so we convert metric
// Open-Meteo data into the user's units before comparing, identical to the app.

const UA = { 'User-Agent': 'StormTracker/1.0 (push scanner; +https://capflyingfun.github.io/StormTracker/)' };

// ---- unit conversions (ported from docs/js/core.js) ----
const WIND_UNITS = ['mph', 'kts', 'km/h', 'm/s'];
const TEMP_UNITS = ['°F', '°C'];
function kmhTo(kmh, unit) {
  if (unit === 0) return +(kmh / 1.609).toFixed(1);
  if (unit === 1) return +(kmh / 1.852).toFixed(1);
  if (unit === 2) return +kmh.toFixed(1);
  return +(kmh / 3.6).toFixed(1);
}
function cToF(c) { return +(c * 9 / 5 + 32).toFixed(1); }

// ---- weather threshold defs (mirror docs/js/thresholds.js _WX_ALERT_DEFS) ----
// f(conditions, userThreshold, unitPrefs) -> { msg } when breached, else null.
const WX_DEFS = [
  { key: 'windMax', label: 'Wind Speed', icon: '💨', f: (d, th, u) => {
    const k = d.wind_speed_10m; if (k == null) return null;
    const v = kmhTo(k, u.wind); const un = WIND_UNITS[u.wind];
    return v >= th ? { msg: `💨 Wind speed at ${v} ${un} — above your ${th} ${un} threshold` } : null; } },
  { key: 'gustMax', label: 'Wind Gusts', icon: '🌬️', f: (d, th, u) => {
    const k = d.wind_gusts_10m; if (k == null) return null;
    const v = kmhTo(k, u.wind); const un = WIND_UNITS[u.wind];
    return v >= th ? { msg: `🌬️ Wind gusts at ${v} ${un} — above your ${th} ${un} threshold` } : null; } },
  { key: 'tempHigh', label: 'Temp High', icon: '🌡️', f: (d, th, u) => {
    const tc = d.temperature_2m; if (tc == null) return null;
    const v = u.temp === 0 ? cToF(tc) : +tc.toFixed(1); const un = TEMP_UNITS[u.temp];
    return v >= th ? { msg: `🌡️ Temperature reached ${v}${un} — above your ${th}${un} high threshold` } : null; } },
  { key: 'tempLow', label: 'Temp Low', icon: '🌡️', f: (d, th, u) => {
    const tc = d.temperature_2m; if (tc == null) return null;
    const v = u.temp === 0 ? cToF(tc) : +tc.toFixed(1); const un = TEMP_UNITS[u.temp];
    return v <= th ? { msg: `🌡️ Temperature dropped to ${v}${un} — below your ${th}${un} low threshold` } : null; } },
  { key: 'pressureDrop', label: 'Pressure Drop (3hr)', icon: '📉', f: (d, th, u) => {
    const drop = d._baroTrendMb != null ? -d._baroTrendMb : null;
    if (drop == null || drop <= 0) return null;
    const v = u.pres === 0 ? +(drop * 0.02953).toFixed(2) : +drop.toFixed(1);
    const un = u.pres === 0 ? 'inHg' : 'mb';
    return v >= th ? { msg: `📉 Falling pressure — dropped ${v} ${un} over the last 3 hours (threshold ${th} ${un})` } : null; } },
  { key: 'rainMax', label: 'Rainfall Rate', icon: '🌧️', f: (d, th, u) => {
    const mmh = d.precipitation; if (mmh == null || mmh <= 0) return null;
    let v, un;
    if (u.precip === 0) { v = +(mmh / 25.4).toFixed(2); un = 'in/hr'; }
    else if (u.precip === 2) { v = +(mmh / 10).toFixed(2); un = 'cm/hr'; }
    else { v = +mmh.toFixed(1); un = 'mm/hr'; }
    return v >= th ? { msg: `🌧️ Rainfall rate at ${v} ${un} — above your ${th} ${un} threshold` } : null; } },
  { key: 'humidHigh', label: 'Humidity High', icon: '💧', f: (d, th) => {
    const v = d.relative_humidity_2m; if (v == null) return null;
    return v >= th ? { msg: `💧 Humidity at ${v}% — above your ${th}% high threshold` } : null; } },
  { key: 'humidLow', label: 'Humidity Low', icon: '💧', f: (d, th) => {
    const v = d.relative_humidity_2m; if (v == null) return null;
    return v <= th ? { msg: `💧 Humidity at ${v}% — below your ${th}% low threshold` } : null; } },
  { key: 'visMin', label: 'Visibility Low', icon: '👁️', f: (d, th, u) => {
    const vm = d._visM; if (vm == null) return null;
    let v, un;
    if (u.vis === 0) { v = +(vm / 1609.34).toFixed(1); un = 'mi'; }
    else { v = +(vm / 1000).toFixed(1); un = 'km'; }
    return v <= th ? { msg: `👁️ Visibility dropped to ${v} ${un} — below your ${th} ${un} threshold` } : null; } },
  // NOTE: the in-app `uvMax` alert reads S._uvIndex, which the app never assigns,
  // so it is currently inert and never fires. To keep background pushes at exact
  // parity with the app we intentionally do NOT evaluate UV here.
];

// Fetch current conditions + 3hr pressure trend + visibility from Open-Meteo.
// Returns the field names the WX_DEFS expect, in metric units (km/h, °C, mm, %,
// meters, mb) — the same source/units the app's threshold checks consume.
async function fetchConditions(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
    + `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,uv_index`
    + `&hourly=pressure_msl,visibility&past_hours=4&forecast_hours=1`
    + `&wind_speed_unit=kmh&temperature_unit=celsius&precipitation_unit=mm&timezone=UTC`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`open-meteo HTTP ${r.status}`);
  const j = await r.json();
  const c = j.current || {};
  const h = j.hourly || {};
  const out = {
    temperature_2m: c.temperature_2m,
    relative_humidity_2m: c.relative_humidity_2m,
    precipitation: c.precipitation,
    wind_speed_10m: c.wind_speed_10m,
    wind_gusts_10m: c.wind_gusts_10m,
    uv_index: c.uv_index,
    _visM: null,
    _baroTrendMb: null,
  };
  // Latest non-null visibility (current hour).
  const vis = h.visibility || [];
  for (let i = vis.length - 1; i >= 0; i--) { if (vis[i] != null) { out._visM = vis[i]; break; } }
  // 3hr pressure trend: latest non-null minus the value 3 hours earlier.
  const pres = h.pressure_msl || [];
  let nowIdx = -1;
  for (let i = pres.length - 1; i >= 0; i--) { if (pres[i] != null) { nowIdx = i; break; } }
  if (nowIdx >= 3 && pres[nowIdx - 3] != null) {
    out._baroTrendMb = +(pres[nowIdx] - pres[nowIdx - 3]).toFixed(2);
  }
  return out;
}

// Evaluate a subscriber's enabled weather thresholds against conditions.
function evalWx(conditions, wxCfg, units) {
  const u = {
    temp: units.temp || 0, wind: units.wind || 0, pres: units.pres || 0,
    vis: units.vis || 0, precip: units.precip || 0,
  };
  const out = [];
  for (const def of WX_DEFS) {
    const cfg = wxCfg[def.key];
    if (!cfg || !cfg.on || cfg.val == null) continue;
    const res = def.f(conditions, cfg.val, u);
    if (res) out.push({ key: def.key, label: def.label, icon: def.icon, msg: res.msg });
  }
  return out;
}

// Active NWS alerts at a point (US only; returns [] elsewhere or on error upstream).
async function fetchNws(lat, lon) {
  const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`nws HTTP ${r.status}`);
  const j = await r.json();
  return (j.features || []).map(f => {
    const p = f.properties || {};
    return {
      id: p.id || f.id,
      event: p.event || 'Weather Alert',
      severity: (p.severity || '').toLowerCase(),
      headline: p.headline || '',
      area: p.areaDesc || '',
    };
  }).filter(a => a.id);
}

function nwsIcon(event) {
  const e = (event || '').toLowerCase();
  if (e.includes('tornado')) return '🌪️';
  if (e.includes('hurricane')) return '🌀';
  if (e.includes('tropical storm')) return '🌀';
  if (e.includes('severe thunderstorm')) return '⛈️';
  if (e.includes('flood')) return '🌊';
  if (e.includes('fire') || e.includes('red flag')) return '🔥';
  if (e.includes('winter') || e.includes('snow') || e.includes('blizzard') || e.includes('ice')) return '❄️';
  if (e.includes('heat')) return '🥵';
  if (e.includes('wind')) return '💨';
  return '⚠️';
}

export { fetchConditions, evalWx, fetchNws, nwsIcon };
