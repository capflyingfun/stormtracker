// StormTracker background scanner — runs on a GitHub Actions cron (~every 30
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
  scanLocation, haversine, bearingDeg, calcImpact, calcETA, degToDir,
} from './detect.js';
import { fetchConditions, evalWx, fetchNws, nwsIcon } from './alerts.js';
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
const COOLDOWN = { sc: 30 * 60 * 1000, wx: 3 * 60 * 60 * 1000, nws: 12 * 60 * 60 * 1000, trop: 12 * 60 * 60 * 1000 };
const PRUNE = { sc: 2 * 60 * 60 * 1000, wx: 12 * 60 * 60 * 1000, nws: 24 * 60 * 60 * 1000, trop: 24 * 60 * 60 * 1000 };
function keyKind(k) { const p = String(k).split('_')[0]; return (p === 'wx' || p === 'nws' || p === 'trop') ? p : 'sc'; }

// Storm-cell defaults mirror the app's intent: inbound + reasonably strong.
const DEF = { dbz: 40, impact: 50, dist: 60, radius: 80 };
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// Randomized scan cadence (like GameMaker's choose). The GitHub cron should fire
// every 5 min; on each tick we only actually scan once the randomly-chosen gap
// has elapsed, then roll the next gap and persist it in the Worker/D1 so the
// stateless next run knows when it's due. Most ticks just exit immediately.
const SCAN_GAPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];

function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

async function getSubscribers() {
  const r = await fetch(`${WORKER_URL}/subscriptions`, { headers: { 'x-scanner-secret': SCANNER_SECRET } });
  if (!r.ok) throw new Error(`/subscriptions HTTP ${r.status}`);
  const d = await r.json();
  return d.subscribers || [];
}

// Shared "next scan due" timestamp (epoch ms) stored in the Worker/D1 so the
// randomized cadence survives across stateless cron runs.
async function getScanDue() {
  try {
    const r = await fetch(`${WORKER_URL}/scan-due`, { headers: { 'x-scanner-secret': SCANNER_SECRET } });
    if (!r.ok) { console.warn(`/scan-due GET HTTP ${r.status}`); return 0; }
    const d = await r.json();
    return Number(d.due) || 0;
  } catch (e) { console.warn('scan-due GET failed:', e.message); return 0; }
}

async function setScanDue(due) {
  try {
    const r = await fetch(`${WORKER_URL}/scan-due`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-scanner-secret': SCANNER_SECRET },
      body: JSON.stringify({ due }),
    });
    if (!r.ok) console.warn(`/scan-due POST HTTP ${r.status}`);
  } catch (e) { console.warn('scan-due POST failed:', e.message); }
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

function fmtStormBody(best, count, mv) {
  const distStr = best.distance.toFixed(1) + ' mi';
  const etaStr = best.etaMin != null ? ` · ETA ${best.etaMin} min` : '';
  let moveStr = '';
  if (mv && mv.speed >= 2) moveStr = ` · moving ${degToDir(mv.direction)} ~${Math.round(mv.speed)} mph`;
  const lead = count > 1 ? `${count} storm cells inbound — strongest ` : 'Storm cell inbound — ';
  return `${lead}${best.dbz} dBZ at ${distStr}${best.impactPct > 0 ? ` · ${best.impactPct}% impact` : ''}${etaStr}${moveStr}`;
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

  // Randomized cadence gate. The cron fires every 5 min, but a scheduled tick
  // only proceeds once the previously-rolled random gap has elapsed. Manual
  // (workflow_dispatch) runs always scan so testing stays immediate.
  const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  if (!manual) {
    const due = await getScanDue();
    if (due && Date.now() < due) {
      console.log(`Not due yet — next scan in ~${Math.ceil((due - Date.now()) / 60000)} min. Skipping tick.`);
      return;
    }
  }
  // Committed to scanning this tick — roll the next random gap now so even an
  // early return below (e.g. no subscribers) keeps the cadence rolling.
  const gap = choose(SCAN_GAPS);
  await setScanDue(Date.now() + gap * 60 * 1000);
  console.log(`Scanning now. Next scan in ~${gap} min.`);

  const subs = await getSubscribers();
  console.log(`Subscribers: ${subs.length}`);
  if (!subs.length) return;

  // Group by coarse location (~0.7 mi) so co-located devices share one scan +
  // one set of conditions/NWS fetches.
  const groups = new Map();
  for (const s of subs) {
    const key = `${s.lat.toFixed(2)},${s.lon.toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  console.log(`Scan groups: ${groups.size}`);

  // Tropical systems are global, not per-location — fetch once and reuse.
  let tropical = [];
  const wantTrop = subs.some(s => { const t = s.thresholds && s.thresholds.tropical; return !t || t.on !== false; });
  if (wantTrop) {
    try { tropical = await fetchTropical(); console.log(`Tropical systems active: ${tropical.length}`); }
    catch (e) { console.warn(`tropical fetch failed: ${e.message}`); }
  }

  const now = Date.now();
  let sent = 0;

  for (const [key, members] of groups) {
    const o = members[0];
    const radius = Math.min(80, Math.max(...members.map(m => thresholdsFor(m).radius)));

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

    for (const sub of members) {
      const th = thresholdsFor(sub);
      const lastAlert = { ...(sub.lastAlert || {}) };
      Object.keys(lastAlert).forEach(k => {
        if (now - lastAlert[k] > (PRUNE[keyKind(k)] || PRUNE.sc)) delete lastAlert[k];
      });
      let dirty = false, dead = false;

      // Collect EVERY currently-active alert for this subscriber across all
      // sources into one list. We send a single digest notification listing them
      // all; each item carries its own dedupe key(s). The digest fires whenever
      // at least one item is "fresh" (past its per-type cooldown), but shows the
      // full active picture and resets every listed item's cooldown.
      const items = [];

      // --- Storm cells ---
      if (cells.length) {
        const personal = cells.map(c => {
          const distance = haversine(sub.lat, sub.lon, c.lat, c.lng);
          const bearing = bearingDeg(sub.lat, sub.lon, c.lat, c.lng);
          const cc = { lat: c.lat, lng: c.lng, dbz: c.dbz, distance, bearing };
          const imp = calcImpact(cc, mv); cc.impactPct = imp.impactPct; cc.impactTier = imp.impactTier;
          const eta = calcETA(cc, mv); cc.etaMin = eta.etaMin; cc.approaching = eta.approaching;
          return cc;
        });
        const hits = personal.filter(c =>
          c.distance <= th.radius && c.approaching &&
          c.dbz >= th.dbz && c.impactPct >= th.impact && c.distance <= th.dist
        );
        if (hits.length) {
          const best = hits.slice().sort((a, b) => (b.impactPct - a.impactPct) || (b.dbz - a.dbz))[0];
          const body = fmtStormBody(best, hits.length, mv);
          const cks = hits.map(c => `sc_${Math.round(c.bearing / 10)}_${Math.round(c.distance / 3)}`);
          items.push({ kind: 'sc', urgency: 'high', cks, display: `🌩️ ${body}`, titleSingle: '🌩️ StormTracker Alert', body });
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
          items.push({ kind: 'nws', urgency: 'high', cks: ['nws_' + a.id], display: `${ic} ${a.event}`, titleSingle: `${ic} ${a.event}`, body: a.headline || a.area || a.event });
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
        const triggered = items.some(it => it.cks.some(ck => now - (lastAlert[ck] || 0) >= COOLDOWN[it.kind]));
        if (triggered) {
          let title, body;
          if (items.length === 1) { title = items[0].titleSingle; body = items[0].body; }
          else {
            title = `🚨 ${items.length} alerts${sub.name ? ' · ' + sub.name : ''}`;
            // Cap the body so a major multi-alert event can't blow past the
            // ~4 KB web-push payload limit; remaining items are still deduped.
            const MAX_LINES = 12;
            const lines = items.map(i => i.display);
            body = (lines.length > MAX_LINES
              ? lines.slice(0, MAX_LINES).concat(`…and ${lines.length - MAX_LINES} more`)
              : lines).join('\n');
          }
          const urgency = items.some(i => i.urgency === 'high') ? 'high' : 'normal';
          const payload = JSON.stringify({ title, body, tag: 'stormtracker-digest', url: SITE_URL });
          const r = await trySend(sub, payload, { TTL: 1800, urgency });
          if (r === 'ok') {
            sent++; dirty = true;
            items.forEach(i => i.cks.forEach(ck => { lastAlert[ck] = now; }));
            console.log(`  ✓ ${sub.name || key}: digest ${items.length} item(s) [${items.map(i => i.kind).join(',')}]`);
          } else if (r === 'dead') dead = true;
        }
      }

      if (dead) { await pruneDead(sub.endpoint); continue; }
      if (dirty) await markAlert(sub.endpoint, lastAlert);
    }
  }
  console.log(`Done. Notifications sent: ${sent}`);
}

run().catch(e => fail(e.stack || e.message));
