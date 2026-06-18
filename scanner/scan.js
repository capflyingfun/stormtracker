// StormTracker background scanner — runs on a GitHub Actions cron (~every 10
// min). Pulls subscribers from the Cloudflare Worker, then for each location
// runs a FULL "fresh open" scan and pushes every alert type the app would show,
// even with the app/browser closed:
//   * Inbound storm cells  (ported radar detection, detect.js)
//   * Weather thresholds   (Open-Meteo conditions vs the user's in-app alert
//                           settings — wind/gust/temp/pressure/rain/humidity/
//                           visibility, alerts.js)
//   * NWS active warnings  (api.weather.gov at the point; US only, alerts.js)
//   * Tropical systems     (NHC cone / proximity, ahead of any local NWS watch;
//                           tropical.js)
// Every active alert for a subscriber is merged into ONE digest notification
// that lists them all, rather than separate pushes per type. Each item is
// deduped independently in the per-subscriber `last_alert` map (namespaced keys
// sc_/wx_/nws_/trop_) so a sustained system doesn't re-notify every run; the
// digest sends whenever at least one item is fresh and shows the full picture.
//
// Required env (set as GitHub Actions secrets):
//   WORKER_URL          e.g. https://stormtracker-proxy.<acct>.workers.dev
//   SCANNER_SECRET      shared secret with the Worker
//   VAPID_PUBLIC_KEY    public VAPID key (also embedded in the PWA)
//   VAPID_PRIVATE_KEY   private VAPID key (secret)
//   VAPID_SUBJECT       optional, defaults to mailto:alerts@stormtracker

import webpush from 'web-push';
import {
  scanLocation, dbzAtPoint, haversine, bearingDeg, calcImpact, calcETA, degToDir,
} from './detect.js';
import { fetchConditions, evalWx, fetchNws, nwsIcon, nwsWindow } from './alerts.js';
import { fetchTropical, evalTropical } from './tropical.js';

const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/$/, '');
const SCANNER_SECRET = process.env.SCANNER_SECRET || '';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:alerts@stormtracker.app';

const SITE_URL = 'https://capflyingfun.github.io/StormTracker/';

// Per-alert-type dedupe (re-notify) and prune (forget) windows, keyed by the
// prefix of each dedupe key. Storm cells move fast (short window); a standing
// NWS warning or weather condition shouldn't re-buzz for hours.
const COOLDOWN = { sc: 30 * 60 * 1000, ltg: 30 * 60 * 1000, rov: 5 * 60 * 1000, wx: 3 * 60 * 60 * 1000, nws: 12 * 60 * 60 * 1000, trop: 12 * 60 * 60 * 1000 };
const PRUNE = { sc: 2 * 60 * 60 * 1000, ltg: 2 * 60 * 60 * 1000, rov: 2 * 60 * 60 * 1000, wx: 12 * 60 * 60 * 1000, nws: 24 * 60 * 60 * 1000, trop: 24 * 60 * 60 * 1000 };
function keyKind(k) { const s = String(k); const base = s.includes('#') ? s.slice(s.indexOf('#') + 1) : s; const p = base.split('_')[0]; return (p === 'wx' || p === 'nws' || p === 'trop' || p === 'ltg' || p === 'rov') ? p : 'sc'; }

// Intensity bands — must match docs/js/thresholds.js _ALERT_BAND_DEFS exactly so
// the background scanner gates and re-notifies identically to the in-app alerts.
// Each band carries an on/off toggle (gates inbound storm pushes AND the
// rain-overhead push at that intensity) and a per-band cadence (minutes) that
// becomes the dedupe cooldown for items in that band. A master rovOn enables the
// "rain right over you" push. When a subscription predates this feature (no
// bands), default to ALL bands on + rovOn true so existing users keep getting
// pushes at their old behavior.
const BAND_DEFS = [
  { key: 'light', label: 'Light', min: 20, max: 29, defOn: true, defMin: 10 },
  { key: 'moderate', label: 'Moderate', min: 30, max: 44, defOn: true, defMin: 5 },
  { key: 'heavy', label: 'Heavy', min: 45, max: 54, defOn: true, defMin: 5 },
  { key: 'severe', label: 'Severe', min: 55, max: 9999, defOn: true, defMin: 5 },
];
const BAND_CADENCE_OPTS = [5, 10, 15, 30];
function bandForDbz(dbz) {
  if (dbz == null || dbz < 20) return null;
  for (const b of BAND_DEFS) if (dbz >= b.min && dbz <= b.max) return b.key;
  return null;
}
function bandLabel(key) { const b = BAND_DEFS.find(x => x.key === key); return b ? b.label : ''; }
// Normalize a subscription's bands config, falling back to defaults for any
// missing field so partial/legacy payloads behave like the in-app defaults.
function bandsFor(sub) {
  const raw = (sub.thresholds && sub.thresholds.bands) || null;
  const out = { rovOn: raw ? raw.rovOn !== false : true };
  for (const b of BAND_DEFS) {
    const c = (raw && raw[b.key]) || {};
    out[b.key] = {
      on: c.on !== undefined ? !!c.on : b.defOn,
      min: BAND_CADENCE_OPTS.includes(c.min) ? c.min : b.defMin,
    };
  }
  return out;
}

// Storm-cell defaults mirror the app's intent: inbound + reasonably strong.
const DEF = { dbz: 40, impact: 50, dist: 60, radius: 80 };
// Lightning corridor is a FIXED 80 mi (the system max), independent of each
// user's personal storm-alert radius — a strong cell 70 mi out still warrants a
// heads-up even if the user only wants storm pushes inside 30 mi.
const LTG_RADIUS = 80;
// Awareness radius: the nearest strong cell within 15 mi is ALWAYS surfaced for
// safety, even if it isn't approaching — a close strike shouldn't be hidden just
// because it isn't heading straight at the user.
const LTG_NEAR = 15;
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// Fixed scan cadence: the GitHub cron IS the schedule (every 5 min), so every
// scheduled tick scans. No randomized gap, no shared due-time state — the cron's
// interval is the only knob. Change the cadence by editing the cron in
// .github/workflows/storm-scan.yml.

function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

async function getSubscribers() {
  const r = await fetch(`${WORKER_URL}/subscriptions`, { headers: { 'x-scanner-secret': SCANNER_SECRET } });
  if (!r.ok) throw new Error(`/subscriptions HTTP ${r.status}`);
  const d = await r.json();
  return d.subscribers || [];
}

async function markAlert(endpoint, lastAlert) {
  try {
    const r = await fetch(`${WORKER_URL}/mark-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-scanner-secret': SCANNER_SECRET },
      body: JSON.stringify({ endpoint, lastAlert }),
    });
    // A failed state write means dedupe drifts -> the same alert re-notifies
    // next run. Surface it loudly so it isn't silently lost.
    if (!r.ok) console.warn(`  mark-alert HTTP ${r.status} for ${endpoint.slice(-12)}`);
  } catch (e) { console.warn('mark-alert failed:', e.message); }
}

async function pruneDead(endpoint) {
  try {
    const r = await fetch(`${WORKER_URL}/mark-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-scanner-secret': SCANNER_SECRET },
      body: JSON.stringify({ endpoint, delete: true }),
    });
    if (!r.ok) console.warn(`  prune HTTP ${r.status}`);
    else console.log('  pruned dead subscription');
  } catch (e) { console.warn('prune failed:', e.message); }
}

function thresholdsFor(sub) {
  const t = sub.thresholds || {};
  return {
    dbz: num(t.dbz, DEF.dbz),
    impact: num(t.impact, DEF.impact),
    dist: num(t.dist, DEF.dist),
    radius: Math.min(80, num(t.radius, DEF.radius)),
  };
}

// Arrival wall-clock for a storm ETA, in the subscriber's own time zone.
// h24=true -> "0809" (military); otherwise "08:09 AM". Empty if tz unknown.
function fmtArrivalClock(etaMin, tz, h24) {
  if (etaMin == null || !tz) return '';
  try {
    const d = new Date(Date.now() + etaMin * 60000);
    if (h24) {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
      const hh = (p.find(x => x.type === 'hour') || {}).value || '';
      const mm = (p.find(x => x.type === 'minute') || {}).value || '';
      return hh && mm ? `${hh}${mm}` : '';
    }
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
  } catch (e) { return ''; }
}

function fmtStormBody(best, count, mv, tz, h24) {
  const distStr = best.distance.toFixed(1) + ' mi away';
  let etaStr = '';
  if (best.etaMin != null) {
    const clock = fmtArrivalClock(best.etaMin, tz, h24);
    // Show the concrete arrival clock time (e.g. "ETA 1058") to save characters;
    // fall back to "N min" only when a clock time can't be computed (no tz).
    etaStr = clock ? ` · ETA ${clock}` : ` · ETA ${best.etaMin} min`;
  }
  let moveStr = '';
  if (mv && mv.speed >= 2) moveStr = ` · moving ${degToDir(mv.direction)} ~${Math.round(mv.speed)} mph`;
  // Always highlight a SINGLE storm — the strongest + soonest inbound. With a lot
  // of cells (12+) keep the line short and point to the app instead of implying a
  // long list, so the phone doesn't truncate the notification.
  let lead, tail = '';
  if (count >= 12) { lead = `Strongest of ${count} storms inbound — `; tail = ' · more inbound, open for details'; }
  else if (count > 1) { lead = `${count} storms inbound — strongest `; }
  else { lead = 'Storm cell inbound — '; }
  return `${lead}${best.dbz} dBZ · ${distStr}${best.impactPct > 0 ? ` · ${best.impactPct}% impact` : ''}${etaStr}${moveStr}${tail}`;
}

// Full compass words for the friendlier lightning advisory ("southwest" reads
// better than "SW" in a safety sentence).
const DIR_LONG = {
  N: 'north', NNE: 'north-northeast', NE: 'northeast', ENE: 'east-northeast',
  E: 'east', ESE: 'east-southeast', SE: 'southeast', SSE: 'south-southeast',
  S: 'south', SSW: 'south-southwest', SW: 'southwest', WSW: 'west-southwest',
  W: 'west', WNW: 'west-northwest', NW: 'northwest', NNW: 'north-northwest',
};
function dirLong(deg) { const a = degToDir(deg); return DIR_LONG[a] || a; }

// Smart lightning advisory from radar-derived strong cells. Lightning is
// estimated (not observed) from reflectivity ≥45 dBZ — the app's "strong storm"
// tier. AWARENESS RULE: always surface the NEAREST strong cell within 15 mi,
// approaching or not, so a close strike is never hidden just because it isn't in
// the user's cone. If nothing is within 15 mi, fall back to the nearest
// approaching cell in the 80 mi corridor so distant inbound lightning still
// warns. Cells arriving within 15 min are flagged as the urgent set to act on.
function fmtLightning(personal, tz, h24) {
  const strong = personal.filter(c => c.dbz >= 45);
  if (!strong.length) return null;
  // Nearest strong cell within 15 mi (any direction) — pure awareness.
  const near = strong.filter(c => c.distance <= LTG_NEAR).sort((a, b) => a.distance - b.distance);
  // Approaching strong cells bearing down out to the 80 mi corridor.
  const corridor = strong.filter(c => c.approaching && c.distance <= LTG_RADIUS).sort((a, b) => a.distance - b.distance);
  if (!near.length && !corridor.length) return null;

  // Lead with the closest cell overall: an in-range (≤15 mi) awareness cell if
  // present, otherwise the nearest approaching corridor cell.
  const lead = near[0] || corridor[0];
  const dist = Math.round(lead.distance);
  let etaStr = '';
  if (lead.approaching && lead.etaMin != null) {
    const clock = fmtArrivalClock(lead.etaMin, tz, h24);
    etaStr = clock ? ` · ETA ${clock}` : ` · ETA ~${lead.etaMin} min`;
  }
  const leadSentence = `Lightning ⚡ estimated to the ${dirLong(lead.bearing)} around ${dist} mi in a strong storm (${lead.dbz} dBZ)${etaStr}.`;

  // Urgent set: approaching cells estimated to reach the user within 15 minutes.
  const soon = corridor.filter(c => c.etaMin != null && c.etaMin <= 15);
  const leadSoon = lead.approaching && lead.etaMin != null && lead.etaMin <= 15;
  let extra = '';
  if (soon.length > 1) {
    const spread = [...new Set(soon.slice(0, 3).map(c => degToDir(c.bearing)))].join('/');
    extra = ` ${soon.length} cells could reach you within 15 min (${spread}).`;
  } else if (soon.length === 1 && !leadSoon) {
    extra = ` A cell to the ${degToDir(soon[0].bearing)} could reach you within 15 min.`;
  }
  if (corridor.length > 1) extra += ` ${corridor.length} strong cells approaching within ${LTG_RADIUS} mi.`;

  const advice = (near.length || soon.length)
    ? ' Move indoors or to a safe location now.'
    : ' Keep an eye on the sky and be ready to move indoors or to a safe location.';

  // Dedupe by coarse direction (45° sectors) + 10 mi distance buckets across the
  // cells we lead on (the nearest awareness cell + the urgent/corridor set), so
  // new activity in a fresh sector/distance retriggers the digest instead of
  // being masked by an unchanged cell still inside its cooldown.
  const keySrc = [...near.slice(0, 1), ...(soon.length ? soon : corridor)];
  const cks = [...new Set(keySrc.map(c => 'ltg_' + Math.round(c.bearing / 45) + '_' + Math.round(c.distance / 10)))];
  return {
    cks,
    display: `⚡ Lightning ~${dist} mi ${degToDir(lead.bearing)} (strong storm)`,
    body: `${leadSentence}${extra}${advice}`,
  };
}

// One-line "bottom line" lead for a multi-alert digest, so the notification
// opens with what to DO, not just a list of what's active.
function situationLead(items) {
  const high = items.some(i => i.urgency === 'high');
  const hasTrop = items.some(i => i.kind === 'trop');
  const hasStorm = items.some(i => i.kind === 'sc' || i.kind === 'ltg' || i.kind === 'rov');
  if (hasTrop) return '🌀 Bottom line: tropical threat developing — review official guidance now.';
  if (high) return '🚨 Bottom line: severe weather active near you — take protective action.';
  if (hasStorm) return '🌧️ Bottom line: storms in your area — stay weather-aware.';
  return '⚠️ Bottom line: active weather near you — stay aware.';
}

// Returns 'ok' | 'dead' | 'err'. 'dead' means the push endpoint is gone (404/410).
async function trySend(sub, payload, opts) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, opts);
    return 'ok';
  } catch (e) {
    const code = e.statusCode || e.status;
    let host = '';
    try { host = new URL(sub.endpoint).host; } catch (_) {}
    const body = (e.body || e.message || '').toString().slice(0, 300).replace(/\s+/g, ' ');
    console.warn(`  ✗ push failed (${code || e.message}) host=${host} bytes=${Buffer.byteLength(payload)} body=${body}`);
    return (code === 404 || code === 410) ? 'dead' : 'err';
  }
}

async function run() {
  if (!WORKER_URL) fail('WORKER_URL not set');
  if (!SCANNER_SECRET) fail('SCANNER_SECRET not set');
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) fail('VAPID keys not set');
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  // Fixed cadence: the GitHub cron is the schedule, so every tick scans. Manual
  // (workflow_dispatch) runs scan immediately too.
  const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  console.log(manual ? 'Manual run — scanning now.' : 'Scheduled run — scanning now.');

  const subs = await getSubscribers();
  console.log(`Subscribers: ${subs.length}`);
  if (!subs.length) return;

  const now = Date.now();
  let sent = 0;

  // Each device (push endpoint) can watch up to 5 saved locations. Fan every
  // subscriber out into one virtual entry PER watched location so the existing
  // per-location scan + grouping handles them all; the device's single endpoint
  // then receives a SEPARATE notification per location (distinct tag), each
  // headed with that location's name. Falls back to the legacy single
  // lat/lon/name for older subscriptions that have no `locs` array.
  const entries = [];
  for (const s of subs) {
    const rawLocs = (s.thresholds && Array.isArray(s.thresholds.locs) && s.thresholds.locs.length)
      ? s.thresholds.locs
      : [{ id: 'home', lat: s.lat, lon: s.lon, name: s.name }];
    // Harden against malformed client payloads: drop invalid coords, de-dupe by
    // locId, and cap at 5 (the saved-location max) per device.
    const seen = new Set();
    for (const L of rawLocs) {
      if (!L || typeof L.lat !== 'number' || typeof L.lon !== 'number') continue;
      const locId = String(L.id || `${L.lat.toFixed(3)},${L.lon.toFixed(3)}`).replace(/#/g, '');
      if (seen.has(locId)) continue;
      seen.add(locId);
      entries.push({ ...s, lat: L.lat, lon: L.lon, name: L.name || s.name, _locId: locId });
      if (seen.size >= 5) break;
    }
  }
  console.log(`Watched locations: ${entries.length}`);
  if (!entries.length) return;

  // Per-ENDPOINT dedupe state. All of a device's locations share one last_alert
  // map (keys namespaced by locId) that we merge across locations and flush
  // ONCE at the end, so locations never clobber each other's cooldowns.
  const epState = new Map();
  for (const s of subs) {
    if (epState.has(s.endpoint)) continue;
    const la = { ...(s.lastAlert || {}) };
    Object.keys(la).forEach(k => { if (now - la[k] > (PRUNE[keyKind(k)] || PRUNE.sc)) delete la[k]; });
    epState.set(s.endpoint, { la, dirty: false, dead: false });
  }

  // Group watched locations by coarse location (~0.7 mi) so co-located entries
  // share one radar / conditions / NWS fetch.
  const groups = new Map();
  for (const e of entries) {
    const key = `${e.lat.toFixed(2)},${e.lon.toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  console.log(`Scan groups: ${groups.size}`);

  // Tropical systems are global, not per-location — fetch once and reuse.
  let tropical = [];
  const wantTrop = subs.some(s => { const t = s.thresholds && s.thresholds.tropical; return !t || t.on !== false; });
  if (wantTrop) {
    try { tropical = await fetchTropical(); console.log(`Tropical systems active: ${tropical.length}`); }
    catch (e) { console.warn(`tropical fetch failed: ${e.message}`); }
  }

  for (const [key, members] of groups) {
    const o = members[0];
    // Scan the full system-max radar (covers the fixed 80 mi lightning corridor)
    // so lightning always has data; per-subscriber storm pushes still filter to
    // each user's own radius/dist below.
    const radius = LTG_RADIUS;

    // 1. Radar storm cells.
    let cells = [], mv = null;
    try {
      const scan = await scanLocation(o.lat, o.lon, radius);
      cells = scan.cells || [];
      mv = scan.mv || null;
      console.log(`[${key}] ${scan.source}: ${cells.length} cells (raw ${scan.rawCount || 0}), steering ${mv ? mv.speed + 'mph@' + mv.direction : 'n/a'}`);
    } catch (e) { console.warn(`  radar ${key} failed: ${e.message}`); }

    // 2. Open-Meteo conditions — only if someone here has an enabled wx alert.
    let conditions = null;
    const wantWx = members.some(m => m.thresholds && m.thresholds.wx &&
      Object.values(m.thresholds.wx).some(c => c && c.on));
    if (wantWx) {
      try { conditions = await fetchConditions(o.lat, o.lon); }
      catch (e) { console.warn(`  conditions ${key} failed: ${e.message}`); }
    }

    // 3. NWS active warnings — unless everyone here opted out.
    let nwsAlerts = [];
    const wantNws = members.some(m => !m.thresholds || m.thresholds.nws !== false);
    if (wantNws) {
      try { nwsAlerts = await fetchNws(o.lat, o.lon); console.log(`  NWS: ${nwsAlerts.length} active`); }
      catch (e) { console.warn(`  nws ${key} failed: ${e.message}`); }
    }

    // 4. Rain right over the user — radar dBZ on the exact spot, only if someone
    // here has the rain-overhead toggle on. One decode per group (members share a
    // coarse location); each sub still applies its own band gate below.
    let overheadDbz = null;
    const wantRov = members.some(m => bandsFor(m).rovOn);
    if (wantRov) {
      try { overheadDbz = await dbzAtPoint(o.lat, o.lon); console.log(`  overhead: ${overheadDbz} dBZ`); }
      catch (e) { console.warn(`  overhead ${key} failed: ${e.message}`); }
    }

    for (const sub of members) {
      const st = epState.get(sub.endpoint);
      if (!st || st.dead) continue; // endpoint already dead/pruned this run
      const lastAlert = st.la;      // shared per-endpoint map (all locations)
      const ns = sub._locId + '#';  // namespace this location's dedupe keys
      const th = thresholdsFor(sub);
      const bands = bandsFor(sub);  // intensity-band gates + rain-overhead toggle

      // Collect EVERY currently-active alert for this subscriber across all
      // sources into one list. We send a single digest notification listing them
      // all; each item carries its own dedupe key(s). The digest fires whenever
      // at least one item is "fresh" (past its per-type cooldown), but shows the
      // full active picture and resets every listed item's cooldown.
      const items = [];

      const tz = sub.thresholds && sub.thresholds.tz;
      const h24 = sub.thresholds && sub.thresholds.h24;

      // --- Storm cells + estimated lightning ---
      if (cells.length) {
        const personal = cells.map(c => {
          const distance = haversine(sub.lat, sub.lon, c.lat, c.lng);
          const bearing = bearingDeg(sub.lat, sub.lon, c.lat, c.lng);
          const cc = { lat: c.lat, lng: c.lng, dbz: c.dbz, distance, bearing };
          const imp = calcImpact(cc, mv); cc.impactPct = imp.impactPct; cc.impactTier = imp.impactTier;
          const eta = calcETA(cc, mv); cc.etaMin = eta.etaMin; cc.approaching = eta.approaching;
          return cc;
        });
        // Inbound cells passing the user's radius/impact/distance filter, then
        // GATED by the intensity bands: a cell only counts if its dBZ falls in a
        // band the user left on. This mirrors the in-app band gate exactly.
        const hits = personal.filter(c =>
          c.distance <= th.radius && c.approaching &&
          c.dbz >= th.dbz && c.impactPct >= th.impact && c.distance <= th.dist &&
          (() => { const bk = bandForDbz(c.dbz); return bk && bands[bk] && bands[bk].on; })()
        );
        if (hits.length) {
          // Strongest + soonest: bucket ETA into ~10-min bands (soonest first),
          // then prefer the strongest (dBZ), then highest impact — so an imminent
          // cell leads, but among similarly-timed cells the strongest wins.
          const best = hits.slice().sort((a, b) => {
            const ea = a.etaMin == null ? 1e9 : a.etaMin;
            const eb = b.etaMin == null ? 1e9 : b.etaMin;
            return (Math.floor(ea / 10) - Math.floor(eb / 10)) || (b.dbz - a.dbz) || (b.impactPct - a.impactPct);
          })[0];
          const body = fmtStormBody(best, hits.length, mv, tz, h24);
          const cks = hits.map(c => `sc_${Math.round(c.bearing / 10)}_${Math.round(c.distance / 3)}`);
          // Re-notify cadence follows the strongest hit's band (the cell that
          // leads the notification), matching the in-app per-cell band cooldown.
          const bestBand = bandForDbz(best.dbz);
          const cooldownMs = bestBand ? bands[bestBand].min * 60000 : COOLDOWN.sc;
          items.push({ kind: 'sc', urgency: 'high', cks, cooldownMs, display: `🌩️ ${body}`, titleSingle: '🌩️ StormTracker Alert', body });
        }

        // Lightning runs off the full corridor (approaching strong cells out to
        // 80 mi), independent of the user's dBZ/impact filter, so a strong cell
        // bearing down can warn even if it hasn't met the storm-alert bar yet.
        const ltg = fmtLightning(personal, tz, h24);
        if (ltg) items.push({ kind: 'ltg', urgency: 'high', cks: ltg.cks, display: ltg.display, titleSingle: '⚡ Lightning Nearby', body: ltg.body });
      }

      // --- Rain right over you (radar dBZ on the exact spot, no inbound needed) ---
      // Fires whenever the overhead radar value lands in an enabled band, even
      // with nothing approaching. Independent of the storm-cell filter above.
      if (bands.rovOn && overheadDbz != null && overheadDbz >= 20) {
        const dbz = Math.round(overheadDbz);
        const bk = bandForDbz(dbz);
        if (bk && bands[bk] && bands[bk].on) {
          const cooldownMs = bands[bk].min * 60000;
          const body = `🌧️ Rain right over you — ${bandLabel(bk)} (${dbz} dBZ)`;
          items.push({ kind: 'rov', urgency: bk === 'severe' ? 'high' : 'normal', cks: ['rov'], cooldownMs, display: body, titleSingle: '🌧️ Rain Overhead', body });
        }
      }

      // --- Weather thresholds (mirror the app's in-app alert settings) ---
      if (conditions && sub.thresholds && sub.thresholds.wx) {
        const breaches = evalWx(conditions, sub.thresholds.wx, sub.thresholds.units || {});
        for (const b of breaches) {
          items.push({ kind: 'wx', urgency: 'normal', cks: ['wx_' + b.key], display: b.msg, titleSingle: '⚠️ StormTracker Weather Alert', body: b.msg });
        }
      }

      // --- NWS active warnings (US) ---
      const nwsOn = !sub.thresholds || sub.thresholds.nws !== false;
      if (nwsOn && nwsAlerts.length) {
        for (const a of nwsAlerts) {
          const ic = nwsIcon(a.event);
          const shortWin = nwsWindow(a, true);
          const fullWin = nwsWindow(a, false);
          const display = `${ic} ${a.event}${shortWin ? ` · ${shortWin}` : ''}`;
          const body = [a.headline || a.area || a.event, fullWin ? `🕐 ${fullWin}` : ''].filter(Boolean).join('\n');
          items.push({ kind: 'nws', urgency: 'high', cks: ['nws_' + a.id], display, titleSingle: `${ic} ${a.event}`, body });
        }
      }

      // --- Tropical systems (NHC cone / proximity, ahead of any local NWS watch) ---
      const tropCfg = sub.thresholds && sub.thresholds.tropical;
      const tropOn = !tropCfg || tropCfg.on !== false;
      if (tropOn && tropical.length) {
        const tropRadius = (tropCfg && num(tropCfg.radius, 0)) || 200;
        for (const t of evalTropical(tropical, sub.lat, sub.lon, tropRadius)) {
          items.push({ kind: 'trop', urgency: t.urgency, cks: ['trop_' + t.ck], display: t.msg, titleSingle: '🌀 Tropical Cyclone Alert', body: t.msg });
        }
      }

      // --- Single merged digest ---
      if (items.length) {
        // An item is "due" when one of its dedupe keys has passed THAT item's own
        // cooldown (its band cadence for storm/rain-overhead, else the per-kind
        // default). The digest fires if ANY item is due and still shows the full
        // active picture, but on send we reset the cooldown ONLY for the items
        // that were actually due — so a fast-cadence alert (e.g. severe rain every
        // 5 min) never keeps resetting a slower sibling sharing the digest (a
        // 10-min light band, a 12h NWS warning), which is what makes each band's
        // re-notify cadence actually hold instead of collapsing to the fastest.
        const isDue = it => { const cd = it.cooldownMs != null ? it.cooldownMs : COOLDOWN[it.kind]; return it.cks.some(ck => now - (lastAlert[ns + ck] || 0) >= cd); };
        const dueItems = items.filter(isDue);
        if (dueItems.length) {
          let title, body;
          if (items.length === 1) { title = items[0].titleSingle + (sub.name ? ' · ' + sub.name : ''); body = items[0].body; }
          else {
            title = `🚨 ${items.length} alerts${sub.name ? ' · ' + sub.name : ''}`;
            // iOS (and most OSes) truncate long notification bodies in the banner
            // / lock screen — we can't make the phone show more. So keep the body
            // SHORT and prioritized: lead with the "bottom line", show only the
            // most important items in full, and collapse the rest into a single
            // "+N more · open for details" line that points to the app.
            // Priority: tropical → NWS warnings → storm cell → lightning → NWS
            // watches → weather thresholds → NWS advisories/statements.
            const nwsTier = ev => /warning/i.test(ev) ? 1 : /watch/i.test(ev) ? 2 : 3;
            const prio = it => {
              if (it.kind === 'trop') return 0;
              if (it.kind === 'nws') return nwsTier(it.display); // 1 warn, 2 watch, 3 adv
              if (it.kind === 'sc') return 1.5;
              if (it.kind === 'ltg') return 1.6;
              if (it.kind === 'rov') return 1.7;
              if (it.kind === 'wx') return 2.5;
              return 4;
            };
            // Among NWS warnings, surface the most dangerous first.
            const WARN_RANK = [/tornado/i, /flash flood/i, /extreme/i, /severe thunderstorm/i, /hurricane/i, /storm surge/i];
            const warnRank = ev => { const i = WARN_RANK.findIndex(re => re.test(ev)); return i < 0 ? WARN_RANK.length : i; };
            const ordered = items
              .map((it, idx) => ({ it, idx }))
              .sort((a, b) => (prio(a.it) - prio(b.it))
                || ((a.it.kind === 'nws' ? warnRank(a.it.display) : 0) - (b.it.kind === 'nws' ? warnRank(b.it.display) : 0))
                || (a.idx - b.idx))
              .map(x => x.it);
            // PIN life-threatening hazards (tropical + any NWS Warning) so they
            // are NEVER collapsed below the fold, even past the soft cap.
            const isCritical = it => it.kind === 'trop' || (it.kind === 'nws' && /warning/i.test(it.display));
            const critical = ordered.filter(isCritical);
            const rest = ordered.filter(it => !isCritical(it));
            const MAX_DETAIL = 3;
            const fill = Math.max(0, MAX_DETAIL - critical.length);
            const shownItems = [...critical, ...rest.slice(0, fill)];
            const shown = shownItems.map(i => i.display);
            const hidden = items.length - shownItems.length;
            if (hidden > 0) shown.push(`⚠️ +${hidden} more alert${hidden > 1 ? 's' : ''} · open for details`);
            body = [situationLead(items), ...shown].join('\n');
          }
          const urgency = items.some(i => i.urgency === 'high') ? 'high' : 'normal';
          const payload = JSON.stringify({ title, body, tag: 'stormtracker-' + sub._locId, url: SITE_URL });
          const r = await trySend(sub, payload, { TTL: 1800, urgency });
          if (r === 'ok') {
            sent++; st.dirty = true;
            dueItems.forEach(i => i.cks.forEach(ck => { lastAlert[ns + ck] = now; }));
            console.log(`  ✓ ${sub.name || key}: digest ${items.length} item(s) [${items.map(i => i.kind).join(',')}], reset ${dueItems.length} due`);
          } else if (r === 'dead') st.dead = true;
        }
      }
    }
  }

  // Flush each device ONCE: prune a dead endpoint, else persist its merged
  // (all-locations) last_alert map a single time so locations don't overwrite
  // each other's cooldowns.
  for (const [endpoint, st] of epState) {
    if (st.dead) { await pruneDead(endpoint); continue; }
    if (st.dirty) await markAlert(endpoint, st.la);
  }
  console.log(`Done. Notifications sent: ${sent}`);
}

run().catch(e => fail(e.stack || e.message));
