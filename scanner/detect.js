// StormTracker server-side detection — a framework-free port of the in-app
// radar pipeline (docs/js/core.js + storms.js) so the GitHub Actions scanner
// detects storms with the same dBZ palettes, tile math, winds-aloft steering,
// spacing filter, impact and ETA logic the browser uses. Node decodes PNG radar
// tiles with pngjs instead of a <canvas>.

import { PNG } from 'pngjs';

// ---------------------------------------------------------------------------
// Geometry (mirrors core.js haversine/bearingDeg + storms.js tile math)
// ---------------------------------------------------------------------------
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}
export function degToDir(d) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(d / 22.5) % 16];
}
export const lonToTileX = (lon, z) => Math.floor((lon + 180) / 360 * Math.pow(2, z));
export const latToTileY = (lat, z) => {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
};
export const isUSLocation = (lat, lon) => lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
export const STORM_MIN_DBZ = 15;

// ---------------------------------------------------------------------------
// dBZ palettes (verbatim from core.js)
// ---------------------------------------------------------------------------
const NEXRAD_PAL = [
  { dbz: 5, r: 100, g: 210, b: 230 }, { dbz: 5, r: 136, g: 221, b: 238 },
  { dbz: 10, r: 54, g: 186, b: 229 }, { dbz: 10, r: 0, g: 100, b: 150 },
  { dbz: 15, r: 0, g: 160, b: 230 }, { dbz: 15, r: 0, g: 136, b: 191 },
  { dbz: 15, r: 0, g: 145, b: 202 }, { dbz: 15, r: 0, g: 163, b: 224 },
  { dbz: 20, r: 0, g: 127, b: 180 }, { dbz: 20, r: 0, g: 112, b: 163 },
  { dbz: 20, r: 0, g: 215, b: 130 }, { dbz: 20, r: 0, g: 145, b: 65 },
  { dbz: 25, r: 0, g: 78, b: 120 }, { dbz: 25, r: 0, g: 74, b: 112 },
  { dbz: 25, r: 0, g: 81, b: 128 }, { dbz: 25, r: 0, g: 85, b: 136 },
  { dbz: 25, r: 0, g: 110, b: 33 }, { dbz: 30, r: 0, g: 75, b: 0 },
  { dbz: 35, r: 255, g: 255, b: 33 }, { dbz: 35, r: 255, g: 238, b: 0 },
  { dbz: 42, r: 255, g: 115, b: 0 },
  { dbz: 45, r: 255, g: 0, b: 0 }, { dbz: 55, r: 150, g: 0, b: 0 },
  { dbz: 55, r: 175, g: 0, b: 150 },
  { dbz: 60, r: 230, g: 100, b: 230 },
];
export function nexradToDbz(r, g, b, a) {
  if (a < 30) return 0;
  if (r + g + b < 40) return 0;
  if (r > 220 && g > 220 && b > 220) return 0;
  let best = 0, bestD = 1e9;
  for (const p of NEXRAD_PAL) {
    const d = (r - p.r) ** 2 + (g - p.g) ** 2 + (b - p.b) ** 2;
    if (d < bestD) { bestD = d; best = p.dbz; }
  }
  if (bestD > 5000) return 0;
  return best;
}
const RV_UB = [
  { dbz: 10, r: 0xce, g: 0xc0, b: 0x87 }, { dbz: 12, r: 0xd6, g: 0xc8, b: 0x8f },
  { dbz: 14, r: 0xde, g: 0xd0, b: 0x97 }, { dbz: 15, r: 0x88, g: 0xdd, b: 0xee },
  { dbz: 16, r: 0x6c, g: 0xd1, b: 0xeb }, { dbz: 17, r: 0x51, g: 0xc5, b: 0xe8 },
  { dbz: 18, r: 0x36, g: 0xba, b: 0xe5 }, { dbz: 19, r: 0x1b, g: 0xae, b: 0xe2 },
  { dbz: 20, r: 0x00, g: 0xa3, b: 0xe0 }, { dbz: 22, r: 0x00, g: 0x91, b: 0xca },
  { dbz: 25, r: 0x00, g: 0x77, b: 0xaa }, { dbz: 27, r: 0x00, g: 0x69, b: 0x9c },
  { dbz: 30, r: 0x00, g: 0x55, b: 0x88 }, { dbz: 32, r: 0x00, g: 0x4e, b: 0x78 },
  { dbz: 34, r: 0x00, g: 0x47, b: 0x68 }, { dbz: 35, r: 0xff, g: 0xee, b: 0x00 },
  { dbz: 37, r: 0xff, g: 0xd2, b: 0x00 }, { dbz: 39, r: 0xff, g: 0xb7, b: 0x00 },
  { dbz: 40, r: 0xff, g: 0xaa, b: 0x00 }, { dbz: 42, r: 0xff, g: 0x95, b: 0x00 },
  { dbz: 44, r: 0xff, g: 0x81, b: 0x00 }, { dbz: 45, r: 0xff, g: 0x44, b: 0x00 },
  { dbz: 47, r: 0xe6, g: 0x28, b: 0x00 }, { dbz: 48, r: 0xd9, g: 0x1b, b: 0x00 },
  { dbz: 50, r: 0xc1, g: 0x00, b: 0x00 }, { dbz: 52, r: 0x8f, g: 0x00, b: 0x00 },
  { dbz: 54, r: 0x5d, g: 0x00, b: 0x00 }, { dbz: 55, r: 0xff, g: 0xaa, b: 0xff },
  { dbz: 57, r: 0xff, g: 0x95, b: 0xff }, { dbz: 60, r: 0xff, g: 0x77, b: 0xff },
  { dbz: 63, r: 0xff, g: 0x58, b: 0xff }, { dbz: 65, r: 0xff, g: 0xff, b: 0xff },
  { dbz: 10, r: 0xbf, g: 0xff, b: 0xff }, { dbz: 15, r: 0x9f, g: 0xdf, b: 0xff },
  { dbz: 20, r: 0x7f, g: 0xbf, b: 0xff }, { dbz: 25, r: 0x5f, g: 0x9f, b: 0xff },
  { dbz: 30, r: 0x4f, g: 0x8f, b: 0xff }, { dbz: 35, r: 0x3f, g: 0x7f, b: 0xff },
  { dbz: 40, r: 0x2f, g: 0x6f, b: 0xff }, { dbz: 45, r: 0x1f, g: 0x5f, b: 0xff },
  { dbz: 50, r: 0x0f, g: 0x4f, b: 0xff }, { dbz: 55, r: 0x00, g: 0x3f, b: 0xff },
];
export function rvToDbz(r, g, b, a) {
  if (a < 20) return 0;
  let raw = 0;
  if (r < 10 && g > 200 && b < 10) raw = 75;
  else if (r > 240 && g > 240 && b > 240) raw = 65;
  else if (r > 200 && b > 200 && g < r) { raw = g > 160 ? 55 : g > 130 ? 57 : g > 100 ? 59 : g > 80 ? 61 : 63; }
  else if (r > 200 && g > 60 && b < 30) {
    if (g > 200) raw = 35; else if (g > 170) raw = 37; else if (g > 140) raw = 39;
    else if (g > 120) raw = 40; else if (g > 100) raw = 42; else if (g > 80) raw = 44; else raw = 45;
  } else if (r > 80 && g < 70 && b < 30 && a > 200) {
    if (r > 240) raw = 45; else if (r > 220) raw = 47; else if (r > 200) raw = 48;
    else if (r > 180) raw = 50; else if (r > 130) raw = 52; else raw = 54;
  } else if (b > 150 && r < 180 && g > 150) {
    if (r > 120) raw = 15; else if (g > 200) raw = 16; else if (g > 180) raw = 17; else raw = 18;
  } else if (r < 10 && g < 180 && b > 80) {
    if (g > 150) raw = 20; else if (g > 120) raw = 22; else if (g > 100) raw = 25;
    else if (g > 80) raw = 28; else raw = 30 + Math.min(4, Math.floor((88 - g) / 10));
  } else if (a < 150 && r > 80 && g > 70 && b > 50 && r < 230) {
    raw = Math.min(14, Math.max(8, Math.round((a - 20) / 15) + 8));
  } else if (b > 200 && g > 100 && r < 150) {
    if (g > 200) raw = 10; else if (g > 160) raw = 15; else if (g > 100) raw = 20; else raw = 30;
  } else {
    let best = 0, bestD = 1e9;
    for (const p of RV_UB) {
      const d = (r - p.r) ** 2 + (g - p.g) ** 2 + (b - p.b) ** 2;
      if (d < bestD) { bestD = d; best = p.dbz; }
    }
    raw = bestD < 6000 ? best : 0;
  }
  if (raw <= 0) return 0;
  return Math.min(75, raw);
}

// ---------------------------------------------------------------------------
// Tile fetch + decode (Node replacement for scanTileForPoints)
// ---------------------------------------------------------------------------
async function fetchPng(url) {
  // Never throw — a single tile timeout/network/decode error must not abort the
  // whole location scan. Callers treat null as "no data for this tile".
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await new Promise(resolve => {
      new PNG().parse(buf, (err, png) => resolve(err ? null : png));
    });
  } catch {
    return null;
  }
}

async function scanTile(url, tx, ty, zoom, colorFn, minDbz, scanRadius, origin, step = 2) {
  try {
    const png = await fetchPng(url);
    if (!png) return [];
    const { width: w, height: h, data } = png; // RGBA8
    const pts = [];
    for (let x = 0; x < w; x += step) {
      for (let y = 0; y < h; y += step) {
        const i = (y * w + x) * 4;
        if (data[i + 3] < 30) continue;
        const dbz = colorFn(data[i], data[i + 1], data[i + 2], data[i + 3]);
        if (dbz < minDbz) continue;
        const ptLon = (tx + x / w) * 360 / Math.pow(2, zoom) - 180;
        const ptLatRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + y / h) / Math.pow(2, zoom))));
        const ptLat = ptLatRad * 180 / Math.PI;
        const dist = haversine(origin.lat, origin.lon, ptLat, ptLon);
        if (dist <= scanRadius) pts.push({ lat: ptLat, lng: ptLon, dbz, dist });
      }
    }
    return pts;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Winds aloft -> steering vector (port of fetchWindsAloft + _applyAloftData)
// Returns { direction, speed(mph) } or null.
// ---------------------------------------------------------------------------
export async function fetchSteering(lat, lon) {
  let aloft = await openMeteoAloft(lat, lon);
  if ((!aloft || aloft.length < 2) && isUSLocation(lat, lon)) {
    try { aloft = await nomadsAloft(lat, lon); } catch { /* keep null */ }
  }
  if (!aloft || aloft.length < 2) return null;
  const steering = aloft.filter(a => a.p <= 850);
  if (!steering.length) return null;
  let tx = 0, ty = 0;
  steering.forEach(a => {
    const spdKt = a.rawMs * 1.944;
    const movDir = (a.dir + 180) % 360;
    const rad = movDir * Math.PI / 180;
    tx += Math.sin(rad) * spdKt;
    ty += Math.cos(rad) * spdKt;
  });
  const ax = tx / steering.length, ay = ty / steering.length;
  const spdKt = Math.sqrt(ax * ax + ay * ay);
  const dir = (Math.atan2(ax, ay) * 180 / Math.PI + 360) % 360;
  return { direction: Math.round(dir), speed: Math.round(spdKt * 1.151) };
}

async function openMeteoAloft(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: ['wind_speed_10m', 'wind_direction_10m',
      'wind_speed_925hPa', 'wind_direction_925hPa',
      'wind_speed_850hPa', 'wind_direction_850hPa',
      'wind_speed_700hPa', 'wind_direction_700hPa',
      'wind_speed_500hPa', 'wind_direction_500hPa'].join(','),
    wind_speed_unit: 'ms', forecast_days: '1', timezone: 'auto',
  });
  const hosts = ['api.open-meteo.com', 'customer-api.open-meteo.com'];
  for (let i = 0; i < hosts.length; i++) {
    try {
      const r = await fetch(`https://${hosts[i]}/v1/forecast?${params}`, { signal: AbortSignal.timeout(7000) });
      if (!r.ok) { if (r.status >= 500 && i < hosts.length - 1) continue; break; }
      const d = await r.json();
      const c = d.current || {};
      const levels = [
        { p: 1013, sk: 'wind_speed_10m', dk: 'wind_direction_10m' },
        { p: 925, sk: 'wind_speed_925hPa', dk: 'wind_direction_925hPa' },
        { p: 850, sk: 'wind_speed_850hPa', dk: 'wind_direction_850hPa' },
        { p: 700, sk: 'wind_speed_700hPa', dk: 'wind_direction_700hPa' },
        { p: 500, sk: 'wind_speed_500hPa', dk: 'wind_direction_500hPa' },
      ];
      const out = [];
      levels.forEach(l => {
        const spd = c[l.sk], dir = c[l.dk];
        if (spd == null || dir == null) return;
        out.push({ p: l.p, dir, rawMs: spd });
      });
      if (out.length >= 2) return out;
    } catch { /* try next host */ }
  }
  return null;
}

async function nomadsAloft(lat, lon) {
  const url = 'https://rucsoundings.noaa.gov/get_soundings.cgi?'
    + 'data_source=GFS&latest=latest&n_hrs=1&fcst_len=shortest'
    + '&airport=' + lat.toFixed(4) + ',' + lon.toFixed(4)
    + '&start=latest&text=Ascii%20text%20%28GSL%20format%29&hydrometeors=false';
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const txt = await r.text();
  if (!txt || txt.length < 100) throw new Error('empty');
  const wanted = [1000, 925, 850, 700, 500];
  const hits = {}; let sfc = null;
  for (const ln of txt.split(/\r?\n/)) {
    const parts = ln.trim().split(/\s+/);
    if (parts.length < 7) continue;
    const t = parseInt(parts[0], 10);
    if (t !== 4 && t !== 5 && t !== 9) continue;
    let p = parseFloat(parts[1]);
    if (isNaN(p) || p <= 0) continue;
    if (p > 1100) p = p / 10;
    const dir = parseFloat(parts[5]); const spdKt = parseFloat(parts[6]);
    if (isNaN(dir) || isNaN(spdKt) || dir >= 9999 || spdKt >= 9999) continue;
    if (t === 9 && !sfc) sfc = { dir, spdKt };
    for (const tp of wanted) { if (!hits[tp] && Math.abs(p - tp) <= 5) { hits[tp] = { dir, spdKt }; break; } }
  }
  const out = [];
  if (sfc) out.push({ p: 1013, dir: sfc.dir, rawMs: sfc.spdKt * 0.5144 });
  for (const p of wanted) { const w = hits[p]; if (w) out.push({ p, dir: w.dir, rawMs: w.spdKt * 0.5144 }); }
  if (out.length < 2) throw new Error('insufficient levels');
  return out;
}

// ---------------------------------------------------------------------------
// Cell clustering (port of spacingFilter)
// ---------------------------------------------------------------------------
export function spacingFilter(points, origin) {
  const validPoints = points.filter(p => {
    if (p.dbz >= 30) return true;
    const radius = p.dbz >= 25 ? 5 : 8;
    let nearby = 0;
    for (const q of points) {
      if (q === p) continue;
      const dx = (p.lat - q.lat) * 69, dy = (p.lng - q.lng) * 69 * Math.cos(p.lat * Math.PI / 180);
      if (Math.sqrt(dx * dx + dy * dy) < radius) { nearby++; if (nearby >= 1) return true; }
    }
    return false;
  });
  validPoints.sort((a, b) => b.dbz - a.dbz);
  const out = [];
  for (const p of validPoints) {
    const minSpacing = p.dbz >= 45 ? 0.8 : p.dbz >= 35 ? 1.2 : 1.8;
    let merged = false;
    for (const e of out) {
      if (haversine(p.lat, p.lng, e.lat, e.lng) < minSpacing) {
        e.pixels++; if (p.dbz > e.dbz) e.dbz = p.dbz; merged = true; break;
      }
    }
    if (!merged) {
      out.push({
        lat: p.lat, lng: p.lng, dbz: p.dbz,
        distance: haversine(origin.lat, origin.lon, p.lat, p.lng),
        bearing: bearingDeg(origin.lat, origin.lon, p.lat, p.lng), pixels: 1,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Impact (port of _calcStormImpact) + ETA (core of calcStormETA, sans
// terrain/NWS-polygon boosts which aren't available server-side).
// ---------------------------------------------------------------------------
export function calcImpact(storm, mv) {
  if (!mv || mv.speed < 2) return { impactPct: 0, impactTier: 'none' };
  const midBear = storm.bearing || 0;
  const midDist = storm.distance || 0;
  const bearToUser = (midBear + 180) % 360;
  const diff = Math.abs(((mv.direction - bearToUser + 180) % 360) - 180);
  const closing = mv.speed * Math.cos(Math.min(diff, 60) * Math.PI / 180);
  const baseWidthMi = Math.max(0, Math.min(3, (storm.dbz - 20) / 15));
  const widthAngle = midDist > 0.5 ? Math.atan2(baseWidthMi, midDist) * 180 / Math.PI : 15;
  const coneHalf = 15 + widthAngle;
  let impactPct = 0, impactTier = 'none';
  if (diff <= coneHalf * 0.6 && closing > 1) { impactTier = 'high'; impactPct = 80 + Math.round(((coneHalf * 0.6) - diff) / (coneHalf * 0.6) * 20); }
  else if (diff <= coneHalf && closing > 0.5) { impactTier = 'medium'; impactPct = 31 + Math.round((coneHalf - diff) / (coneHalf * 0.4) * 49); }
  else if (diff <= coneHalf + 10) { impactTier = 'low'; impactPct = Math.max(5, Math.round((coneHalf + 10 - diff) / 10 * 30)); }
  return { impactPct, impactTier };
}

export function calcETA(storm, mv) {
  if (!mv || mv.speed < 2) return { etaMin: null, approaching: false, closingSpeed: 0 };
  const baseWidthMi = Math.max(0, Math.min(3, (storm.dbz - 20) / 15));
  const widthAngle = storm.distance > 0.5 ? Math.atan2(baseWidthMi, storm.distance) * 180 / Math.PI : 15;
  const coneHalf = 15 + widthAngle;
  const bearingToUser = (storm.bearing + 180) % 360;
  const diff = Math.abs(((mv.direction - bearingToUser + 180) % 360) - 180);
  const inCone = diff <= coneHalf;
  const closingSpeed = mv.speed * Math.cos(Math.min(diff, 60) * Math.PI / 180);
  if (!inCone || closingSpeed <= 1) return { etaMin: null, approaching: false, closingSpeed: Math.max(0, closingSpeed) };
  const etaMin = Math.round(storm.distance / closingSpeed * 60);
  return { etaMin, approaching: true, closingSpeed };
}

// ---------------------------------------------------------------------------
// Full scan for one location. Returns { cells, mv, source }.
// thresholds.radius (mi) defaults to 80; clamps tile count like the app.
// ---------------------------------------------------------------------------
export async function scanLocation(lat, lon, radius = 80) {
  const origin = { lat, lon };
  const useNexrad = isUSLocation(lat, lon);
  const mv = await fetchSteering(lat, lon);

  let zoom = useNexrad ? (radius <= 15 ? 11 : radius <= 30 ? 10 : radius <= 50 ? 9 : 8) : (radius <= 30 ? 8 : 7);
  const radiusDeg = radius / 69.0;
  const northLat = lat + radiusDeg, southLat = lat - radiusDeg;
  const eastLon = lon + radiusDeg / Math.cos(lat * Math.PI / 180);
  const westLon = lon - radiusDeg / Math.cos(lat * Math.PI / 180);
  let minTX = lonToTileX(westLon, zoom), maxTX = lonToTileX(eastLon, zoom);
  let minTY = latToTileY(northLat, zoom), maxTY = latToTileY(southLat, zoom);
  while ((maxTX - minTX + 1) * (maxTY - minTY + 1) > 48 && zoom > (useNexrad ? 8 : 7)) {
    zoom--; minTX = lonToTileX(westLon, zoom); maxTX = lonToTileX(eastLon, zoom);
    minTY = latToTileY(northLat, zoom); maxTY = latToTileY(southLat, zoom);
  }

  let rvPath = null;
  if (!useNexrad) {
    try {
      const rv = await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal: AbortSignal.timeout(6000) }).then(r => r.json());
      const frames = (rv.radar?.past || []).concat(rv.radar?.nowcast || []);
      rvPath = frames.length ? frames[frames.length - 1].path : null;
    } catch { rvPath = null; }
    if (!rvPath) return { cells: [], mv, source: 'rainviewer', error: 'no radar frames' };
  }

  const colorFn = useNexrad ? nexradToDbz : rvToDbz;
  const minDbz = STORM_MIN_DBZ;
  const tasks = [];
  for (let tx = minTX; tx <= maxTX; tx++) {
    for (let ty = minTY; ty <= maxTY; ty++) {
      const url = useNexrad
        ? `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/${zoom}/${tx}/${ty}.png`
        : `https://tilecache.rainviewer.com${rvPath}/256/${zoom}/${tx}/${ty}/2/1_1.png`;
      tasks.push(scanTile(url, tx, ty, zoom, colorFn, minDbz, radius, origin));
    }
  }
  // Promise.allSettled so a rejected tile (should be impossible now, but be
  // defensive) degrades to "no points" rather than failing the whole scan.
  const settled = await Promise.allSettled(tasks);
  const raw = settled.flatMap(s => (s.status === 'fulfilled' ? s.value : []));
  const cells = spacingFilter(raw, origin).sort((a, b) => a.distance - b.distance);
  for (const c of cells) {
    const imp = calcImpact(c, mv);
    c.impactPct = imp.impactPct; c.impactTier = imp.impactTier;
    const eta = calcETA(c, mv);
    c.etaMin = eta.etaMin; c.approaching = eta.approaching; c.closingSpeed = eta.closingSpeed;
  }
  return { cells, mv, source: useNexrad ? 'NEXRAD' : 'RainViewer', rawCount: raw.length };
}
