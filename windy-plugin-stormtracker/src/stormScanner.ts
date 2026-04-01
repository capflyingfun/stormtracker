export interface StormCell {
    lat: number;
    lng: number;
    dbz: number;
    dist: number;
    bearing: number;
    eta: { minutes: number; impact: number; approaching: boolean } | null;
    track: CellTrack | null;
}

export interface CellTrack {
    dir: number;
    speed: number;
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
    dbz: number;
}

export interface WindData {
    direction: number;
    speed: number;
}

interface ScanSnapshot {
    ts: number;
    cells: { lat: number; lng: number; dbz: number; dist: number; bearing: number }[];
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = (lat2 - lat1) * DEG2RAD;
    const dLon = (lon2 - lon1) * DEG2RAD;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
    return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = (lon2 - lon1) * DEG2RAD;
    const y = Math.sin(dLon) * Math.cos(lat2 * DEG2RAD);
    const x = Math.cos(lat1 * DEG2RAD) * Math.sin(lat2 * DEG2RAD) - Math.sin(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.cos(dLon);
    return (Math.atan2(y, x) * RAD2DEG + 360) % 360;
}

export function destPoint(lat: number, lon: number, brng: number, distMi: number): [number, number] {
    const R = 3958.8;
    const d = distMi / R;
    const br = brng * DEG2RAD;
    const la = lat * DEG2RAD;
    const lo = lon * DEG2RAD;
    const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
    const lon2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
    return [lat2 * RAD2DEG, lon2 * RAD2DEG];
}

export function degToDir(deg: number): string {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
}

function rvToDbz(r: number, g: number, b: number, a: number): number {
    if (a < 30) return 0;
    if (r >= 254 && g < 20 && b >= 254) return 65;
    if (r >= 200 && g < 60 && b >= 200) return 60;
    if (r >= 230 && g < 40 && b < 80) return 55;
    if (r >= 200 && g < 40 && b < 40) return 50;
    if (r >= 200 && g >= 120 && b < 40) return 45;
    if (r >= 200 && g >= 200 && b < 40) return 40;
    if (r >= 140 && r <= 200 && g >= 200 && b < 40) return 37;
    if (g >= 200 && r < 100 && b < 100) return 33;
    if (g >= 180 && r < 60 && b >= 140) return 28;
    if (r < 80 && g >= 200 && b >= 200) return 22;
    if (r < 40 && g < 180 && b >= 200) return 18;
    if (a >= 30 && a < 100) return 12;
    const mx = Math.max(r, g, b);
    if (mx < 60) return 10;
    return Math.round(15 + (mx / 255) * 45);
}

function nexradToDbz(r: number, g: number, b: number, a: number): number {
    if (a < 30) return 0;
    if (r >= 254 && g < 20 && b >= 254) return 70;
    if (r >= 230 && g < 50 && b >= 230) return 65;
    if (r >= 250 && g >= 250 && b >= 250) return 60;
    if (r >= 200 && g < 50 && b < 80) return 55;
    if (r >= 230 && g < 30 && b < 30) return 50;
    if (r >= 200 && g >= 100 && b < 40) return 45;
    if (r >= 200 && g >= 200 && b < 40) return 40;
    if (g >= 200 && r < 100 && b < 100) return 35;
    if (g >= 140 && r < 60 && b < 60) return 30;
    if (r < 40 && g < 200 && b >= 200) return 25;
    if (r < 40 && g < 120 && b >= 160) return 20;
    return Math.round(10 + (Math.max(r, g, b) / 255) * 40);
}

async function decodeRvRgba(buf: ArrayBuffer) {
    const v = new DataView(buf);
    if (buf.byteLength < 29) throw new Error('PNG too small');
    let o = 8, w = 0, h = 0, bd = 0, ct = 0;
    const idats: Uint8Array[] = [];
    while (o + 8 <= v.byteLength) {
        const len = v.getUint32(o);
        if (len > buf.byteLength) break;
        const t = String.fromCharCode(v.getUint8(o + 4), v.getUint8(o + 5), v.getUint8(o + 6), v.getUint8(o + 7));
        if (t === 'IHDR' && o + 17 < v.byteLength) { w = v.getUint32(o + 8); h = v.getUint32(o + 12); bd = v.getUint8(o + 16); ct = v.getUint8(o + 17); }
        else if (t === 'IDAT') { if (o + 8 + len <= buf.byteLength) idats.push(new Uint8Array(buf, o + 8, len)); }
        else if (t === 'IEND') break;
        o += 12 + len;
        if (o < 0) break;
    }
    const total = idats.reduce((s, c) => s + c.length, 0);
    const comp = new Uint8Array(total);
    let p = 0; for (const c of idats) { comp.set(c, p); p += c.length; }
    const ds = new DecompressionStream('deflate');
    const wr = ds.writable.getWriter();
    wr.write(comp); wr.close();
    const rd = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); }
    const dLen = chunks.reduce((s, c) => s + c.length, 0);
    const raw = new Uint8Array(dLen);
    p = 0; for (const c of chunks) { raw.set(c, p); p += c.length; }
    const bpp = ct === 6 ? 4 : ct === 4 ? 2 : ct === 2 ? 3 : 1;
    const stride = w * bpp;
    if (!w || !h || dLen < h * (stride + 1)) throw new Error('Bad dimensions');
    const rgba = new Uint8Array(w * h * 4);
    const prev = new Uint8Array(stride);
    for (let y = 0; y < h; y++) {
        const fi = y * (stride + 1);
        if (fi + 1 + stride > raw.length) break;
        const filter = raw[fi];
        const line = new Uint8Array(stride);
        for (let x = 0; x < stride; x++) {
            let val = raw[fi + 1 + x];
            const a = x >= bpp ? line[x - bpp] : 0;
            const b2 = prev[x];
            const c = x >= bpp ? prev[x - bpp] : 0;
            if (filter === 1) val = (val + a) & 255;
            else if (filter === 2) val = (val + b2) & 255;
            else if (filter === 3) val = (val + ((a + b2) >> 1)) & 255;
            else if (filter === 4) { const pa = Math.abs(b2 - c), pb = Math.abs(a - c), pc = Math.abs(a + b2 - 2 * c); val = (val + (pa <= pb && pa <= pc ? a : pb <= pc ? b2 : c)) & 255; }
            line[x] = val;
        }
        for (let x = 0; x < w; x++) {
            const di = (y * w + x) * 4;
            if (bpp === 4) { rgba[di] = line[x * 4]; rgba[di + 1] = line[x * 4 + 1]; rgba[di + 2] = line[x * 4 + 2]; rgba[di + 3] = line[x * 4 + 3]; }
            else if (bpp === 2) { rgba[di] = line[x * 2]; rgba[di + 1] = line[x * 2]; rgba[di + 2] = line[x * 2]; rgba[di + 3] = line[x * 2 + 1]; }
        }
        prev.set(line);
    }
    return { w, h, data: rgba };
}

function isUSLocation(lat: number, lon: number): boolean {
    return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
}

interface RawPoint { lat: number; lng: number; dbz: number; dist: number; }

async function scanTile(url: string, tx: number, ty: number, zoom: number, colorFn: Function, minDbz: number, centerLat: number, centerLon: number, scanRadius: number, step: number): Promise<RawPoint[]> {
    const isRV = url.includes('rainviewer');
    if (isRV) {
        try {
            const res = await fetch(url);
            if (!res.ok) return [];
            const buf = await res.arrayBuffer();
            const { w, h, data } = await decodeRvRgba(buf);
            const pts: RawPoint[] = [];
            for (let x = 0; x < w; x += step) {
                for (let y = 0; y < h; y += step) {
                    const i = (y * w + x) * 4;
                    if (data[i + 3] < 30) continue;
                    const dbz = rvToDbz(data[i], data[i + 1], data[i + 2], data[i + 3]);
                    if (dbz < minDbz) continue;
                    const ptLon = (tx + x / w) * 360 / Math.pow(2, zoom) - 180;
                    const ptLatRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + y / h) / Math.pow(2, zoom))));
                    const ptLat = ptLatRad * RAD2DEG;
                    const dist = haversine(centerLat, centerLon, ptLat, ptLon);
                    if (dist <= scanRadius) pts.push({ lat: ptLat, lng: ptLon, dbz, dist });
                }
            }
            return pts;
        } catch { return []; }
    }
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = url;
    });
    if (!img) return [];
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    let data: Uint8ClampedArray;
    try { data = ctx.getImageData(0, 0, 256, 256).data; } catch { return []; }
    const pts: RawPoint[] = [];
    for (let x = 0; x < 256; x += step) {
        for (let y = 0; y < 256; y += step) {
            const i = (y * 256 + x) * 4;
            if (data[i + 3] < 30) continue;
            const dbz = colorFn(data[i], data[i + 1], data[i + 2], data[i + 3]);
            if (dbz >= minDbz) {
                const ptLon = (tx + x / 256) * 360 / Math.pow(2, zoom) - 180;
                const ptLatRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + y / 256) / Math.pow(2, zoom))));
                const ptLat = ptLatRad * RAD2DEG;
                const dist = haversine(centerLat, centerLon, ptLat, ptLon);
                if (dist <= scanRadius) pts.push({ lat: ptLat, lng: ptLon, dbz, dist });
            }
        }
    }
    return pts;
}

function clusterPoints(pts: RawPoint[], gridSize: number, centerLat: number, centerLon: number): StormCell[] {
    if (!pts.length) return [];
    const cells = new Map<string, { lats: number[]; lngs: number[]; dbzs: number[]; maxDbz: number }>();
    for (const p of pts) {
        const gx = Math.floor(p.lng / gridSize);
        const gy = Math.floor(p.lat / gridSize);
        const key = `${gx}_${gy}`;
        let c = cells.get(key);
        if (!c) { c = { lats: [], lngs: [], dbzs: [], maxDbz: 0 }; cells.set(key, c); }
        c.lats.push(p.lat);
        c.lngs.push(p.lng);
        c.dbzs.push(p.dbz);
        if (p.dbz > c.maxDbz) c.maxDbz = p.dbz;
    }
    const storms: StormCell[] = [];
    for (const c of cells.values()) {
        if (c.dbzs.length < 2) continue;
        const lat = c.lats.reduce((a, b) => a + b) / c.lats.length;
        const lng = c.lngs.reduce((a, b) => a + b) / c.lngs.length;
        const dist = haversine(centerLat, centerLon, lat, lng);
        const brg = bearing(centerLat, centerLon, lat, lng);
        storms.push({ lat, lng, dbz: c.maxDbz, dist, bearing: brg, eta: null, track: null });
    }
    storms.sort((a, b) => a.dist - b.dist);
    return storms;
}

const NEXRAD_SITES = [
    { id: 'BMX', lat: 33.172, lon: -86.770 }, { id: 'EOX', lat: 31.460, lon: -85.459 },
    { id: 'MOB', lat: 30.679, lon: -88.240 }, { id: 'TLH', lat: 30.397, lon: -84.329 },
    { id: 'JAX', lat: 30.485, lon: -81.702 }, { id: 'SHV', lat: 32.451, lon: -93.841 },
    { id: 'HGX', lat: 29.472, lon: -95.079 }, { id: 'FWS', lat: 32.573, lon: -97.303 },
    { id: 'TLX', lat: 35.333, lon: -97.278 }, { id: 'INX', lat: 36.175, lon: -95.564 },
    { id: 'SGF', lat: 37.235, lon: -93.400 }, { id: 'LSX', lat: 38.699, lon: -90.683 },
    { id: 'ICT', lat: 37.655, lon: -97.443 }, { id: 'OAX', lat: 41.320, lon: -96.367 },
    { id: 'MPX', lat: 44.849, lon: -93.565 }, { id: 'LOT', lat: 41.604, lon: -88.085 },
    { id: 'DTX', lat: 42.700, lon: -83.472 }, { id: 'CLE', lat: 41.413, lon: -81.860 },
    { id: 'IND', lat: 39.708, lon: -86.280 }, { id: 'PUX', lat: 38.460, lon: -104.181 },
    { id: 'FTG', lat: 39.787, lon: -104.546 }, { id: 'PHX', lat: 33.422, lon: -112.166 },
    { id: 'ATX', lat: 48.195, lon: -122.496 }, { id: 'RTX', lat: 45.715, lon: -122.965 },
    { id: 'DAX', lat: 38.501, lon: -121.678 }, { id: 'SOX', lat: 33.818, lon: -117.636 },
    { id: 'LWX', lat: 38.975, lon: -77.478 }, { id: 'OKX', lat: 40.866, lon: -72.864 },
    { id: 'BOX', lat: 41.956, lon: -71.137 }, { id: 'RAX', lat: 35.665, lon: -78.490 },
    { id: 'FFC', lat: 33.363, lon: -84.566 }, { id: 'MLB', lat: 28.113, lon: -80.654 },
    { id: 'AMX', lat: 25.611, lon: -80.413 }, { id: 'TBW', lat: 27.706, lon: -82.402 },
];

function findNearestRadar(lat: number, lon: number): string {
    let best = NEXRAD_SITES[0], bestD = Infinity;
    for (const s of NEXRAD_SITES) { const d = Math.hypot(lat - s.lat, lon - s.lon); if (d < bestD) { bestD = d; best = s; } }
    return best.id;
}

let _scanHistory: ScanSnapshot[] = [];
let _cellTracks: Record<string, CellTrack> = {};
let _lastScanCenter: { lat: number; lon: number } | null = null;

function resetTrackingIfMoved(lat: number, lon: number) {
    if (_lastScanCenter) {
        const drift = haversine(_lastScanCenter.lat, _lastScanCenter.lon, lat, lon);
        if (drift > 20) {
            _scanHistory = [];
            _cellTracks = {};
        }
    }
    _lastScanCenter = { lat, lon };
}

function buildCellTracks(prev: ScanSnapshot, curr: ScanSnapshot) {
    const dtHrs = (curr.ts - prev.ts) / 3600000;
    if (dtHrs <= 0 || dtHrs > 1) return;
    const tracks: Record<string, CellTrack> = {};
    for (const c of curr.cells) {
        let best = null, bestD = Infinity;
        for (const p of prev.cells) {
            const d = haversine(c.lat, c.lng, p.lat, p.lng);
            const dbzDiff = Math.abs(c.dbz - p.dbz);
            if (d < bestD && d < 15 && dbzDiff < 25) { bestD = d; best = p; }
        }
        if (best) {
            const spdMph = bestD / dtHrs;
            if (spdMph > 120) continue;
            const dy = c.lat - best.lat, dx = (c.lng - best.lng) * Math.cos(c.lat * DEG2RAD);
            const dir = (Math.atan2(dx, dy) * RAD2DEG + 360) % 360;
            const key = `${c.lat.toFixed(2)}_${c.lng.toFixed(2)}`;
            tracks[key] = { dir: Math.round(dir), speed: Math.round(spdMph), fromLat: best.lat, fromLng: best.lng, toLat: c.lat, toLng: c.lng, dbz: c.dbz };
        }
    }
    _cellTracks = tracks;
}

function getCellTrack(storm: StormCell): CellTrack | null {
    const key = `${storm.lat.toFixed(2)}_${storm.lng.toFixed(2)}`;
    return _cellTracks[key] || null;
}

export async function fetchWindsAloft(lat: number, lon: number): Promise<WindData | null> {
    try {
        const params = new URLSearchParams({
            latitude: lat.toString(), longitude: lon.toString(),
            current: ['wind_speed_850hPa', 'wind_direction_850hPa', 'wind_speed_700hPa', 'wind_direction_700hPa', 'wind_speed_500hPa', 'wind_direction_500hPa'].join(','),
            wind_speed_unit: 'ms', forecast_days: '1', timezone: 'auto'
        });
        const r = await fetch('https://api.open-meteo.com/v1/forecast?' + params, { signal: AbortSignal.timeout(6000) });
        if (!r.ok) return null;
        const d = await r.json();
        const c = d.current;
        const steering = [
            { sk: 'wind_speed_850hPa', dk: 'wind_direction_850hPa' },
            { sk: 'wind_speed_700hPa', dk: 'wind_direction_700hPa' },
            { sk: 'wind_speed_500hPa', dk: 'wind_direction_500hPa' },
        ];
        let tx = 0, ty = 0, cnt = 0;
        for (const s of steering) {
            const spd = c[s.sk], dir = c[s.dk];
            if (spd == null || dir == null) continue;
            const spdKt = spd * 1.944;
            const movDir = (dir + 180) % 360;
            const rad = movDir * DEG2RAD;
            tx += Math.sin(rad) * spdKt;
            ty += Math.cos(rad) * spdKt;
            cnt++;
        }
        if (!cnt) return null;
        const ax = tx / cnt, ay = ty / cnt;
        const spdKt = Math.sqrt(ax * ax + ay * ay);
        const dir = (Math.atan2(ax, ay) * RAD2DEG + 360) % 360;
        const spdMph = Math.round(spdKt * 1.151);
        return { direction: Math.round(dir), speed: spdMph };
    } catch { return null; }
}

function calcETA(storm: StormCell, wind: WindData | null, centerLat: number, centerLon: number): StormCell['eta'] {
    if (!wind || wind.speed < 2) return null;
    const track = getCellTrack(storm);
    const movDir = track ? track.dir : wind.direction;
    const movSpd = track ? track.speed : wind.speed;
    const bearingToUser = (storm.bearing + 180) % 360;
    const diff = Math.abs(((movDir - bearingToUser + 180) % 360) - 180);
    const CONE_HALF = 20;
    const inCone = diff <= CONE_HALF;
    const closingSpeed = movSpd * Math.cos(Math.min(diff, 60) * DEG2RAD);
    if (!inCone || closingSpeed <= 1) {
        if (storm.dist <= 2) return { minutes: 0, impact: Math.min(80, storm.dbz), approaching: false };
        return null;
    }
    const etaMin = Math.round((storm.dist / closingSpeed) * 60);
    const impact = Math.round(Math.min(95, (1 - storm.dist / 80) * 40 + storm.dbz / 1.5 + (closingSpeed > 10 ? 15 : 0)));
    return { minutes: Math.max(0, etaMin), impact: Math.max(0, impact), approaching: true };
}

export async function scanForStorms(centerLat: number, centerLon: number, scanRadius: number): Promise<{ storms: StormCell[]; source: string; wind: WindData | null }> {
    resetTrackingIfMoved(centerLat, centerLon);
    const useNexrad = isUSLocation(centerLat, centerLon);
    const zoom = 6;
    const step = 2;
    const minDbz = 25;
    const gridSize = 0.15;

    let rvPath = '';
    let source = 'RainViewer';
    try {
        const rv = await fetch('https://api.rainviewer.com/public/weather-maps.json').then(r => r.json());
        const frames = (rv.radar?.past || []).concat(rv.radar?.nowcast || []);
        if (frames.length) rvPath = frames[frames.length - 1].path;
    } catch {}

    const n = Math.pow(2, zoom);
    const centerTX = Math.floor(((centerLon + 180) / 360) * n);
    const centerTY = Math.floor((1 - Math.log(Math.tan(centerLat * DEG2RAD) + 1 / Math.cos(centerLat * DEG2RAD)) / Math.PI) / 2 * n);

    const tileRange = zoom <= 6 ? 3 : 2;
    const tiles: { tx: number; ty: number }[] = [];
    for (let dx = -tileRange; dx <= tileRange; dx++) {
        for (let dy = -tileRange; dy <= tileRange; dy++) {
            tiles.push({ tx: centerTX + dx, ty: centerTY + dy });
        }
    }

    let allPts: RawPoint[] = [];

    if (useNexrad) {
        source = 'NEXRAD Composite';
        const nexUrls = tiles.map(t => ({
            url: `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/${zoom}/${t.tx}/${t.ty}.png?t=${Date.now()}`,
            tx: t.tx, ty: t.ty
        }));
        const results = await Promise.allSettled(nexUrls.map(u => scanTile(u.url, u.tx, u.ty, zoom, nexradToDbz, minDbz, centerLat, centerLon, scanRadius, step)));
        for (const r of results) { if (r.status === 'fulfilled') allPts.push(...r.value); }
    }

    if (!allPts.length && rvPath) {
        source = 'RainViewer';
        const rvUrls = tiles.map(t => ({
            url: `https://tilecache.rainviewer.com${rvPath}/256/${zoom}/${t.tx}/${t.ty}/2/1_1.png`,
            tx: t.tx, ty: t.ty
        }));
        const results = await Promise.allSettled(rvUrls.map(u => scanTile(u.url, u.tx, u.ty, zoom, rvToDbz, minDbz, centerLat, centerLon, scanRadius, step)));
        for (const r of results) { if (r.status === 'fulfilled') allPts.push(...r.value); }
    }

    const storms = clusterPoints(allPts, gridSize, centerLat, centerLon);

    const snap: ScanSnapshot = {
        ts: Date.now(),
        cells: storms.map(s => ({ lat: s.lat, lng: s.lng, dbz: s.dbz, dist: s.dist, bearing: s.bearing }))
    };
    _scanHistory.push(snap);
    if (_scanHistory.length > 5) _scanHistory.shift();
    if (_scanHistory.length >= 2) buildCellTracks(_scanHistory[_scanHistory.length - 2], snap);

    for (const s of storms) {
        s.track = getCellTrack(s);
    }

    const wind = await fetchWindsAloft(centerLat, centerLon);
    for (const s of storms) {
        s.eta = calcETA(s, wind, centerLat, centerLon);
    }

    return { storms, source, wind };
}

export function dbzColor(dbz: number): string {
    if (dbz >= 60) return '#ff00ff';
    if (dbz >= 55) return '#ff0033';
    if (dbz >= 50) return '#ff2200';
    if (dbz >= 45) return '#ff5500';
    if (dbz >= 40) return '#ffee00';
    if (dbz >= 35) return '#aaff00';
    if (dbz >= 30) return '#00ff66';
    if (dbz >= 25) return '#00ffcc';
    return '#00ccff';
}

export function dbzLabel(dbz: number): string {
    if (dbz >= 60) return 'EXTREME';
    if (dbz >= 50) return 'Intense';
    if (dbz >= 45) return 'Heavy';
    if (dbz >= 40) return 'Mod-Heavy';
    if (dbz >= 35) return 'Moderate';
    if (dbz >= 30) return 'Light-Mod';
    if (dbz >= 25) return 'Light';
    return 'Trace';
}
