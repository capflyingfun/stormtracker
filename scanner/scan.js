// StormTracker background scanner — runs on a GitHub Actions cron (~every 30
// min). Pulls subscribers from the Cloudflare Worker, runs the ported radar
// detection per location, and sends Web Push notifications for inbound storms
// that match each subscriber's thresholds. Dedupes per storm cell so a single
// system doesn't notify on every run.
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

const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/$/, '');
const SCANNER_SECRET = process.env.SCANNER_SECRET || '';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:alerts@stormtracker.app';

const COOLDOWN_MS = 30 * 60 * 1000; // per-cell dedupe window
const PRUNE_MS = 2 * 60 * 60 * 1000; // forget cell keys older than this
const SITE_URL = 'https://capflyingfun.github.io/StormTracker/';

// Defaults mirror the app's storm-cell alert intent: inbound + reasonably
// strong + meaningful chance of impact.
const DEF = { dbz: 40, impact: 50, dist: 60, radius: 80 };

function fail(msg) { console.error('FATAL:', msg); process.exit(1); }

async function getSubscribers() {
  const r = await fetch(`${WORKER_URL}/subscriptions`, { headers: { 'x-scanner-secret': SCANNER_SECRET } });
  if (!r.ok) throw new Error(`/subscriptions HTTP ${r.status}`);
  const d = await r.json();
  return d.subscribers || [];
}

async function markAlert(endpoint, lastAlert) {
  try {
    await fetch(`${WORKER_URL}/mark-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-scanner-secret': SCANNER_SECRET },
      body: JSON.stringify({ endpoint, lastAlert }),
    });
  } catch (e) { console.warn('mark-alert failed:', e.message); }
}

async function pruneDead(endpoint) {
  try {
    await fetch(`${WORKER_URL}/mark-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-scanner-secret': SCANNER_SECRET },
      body: JSON.stringify({ endpoint, delete: true }),
    });
    console.log('  pruned dead subscription');
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
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

function fmtBody(best, count, mv) {
  const distStr = best.distance.toFixed(1) + ' mi';
  const etaStr = best.etaMin != null ? ` · ETA ${best.etaMin} min` : '';
  let moveStr = '';
  if (mv && mv.speed >= 2) moveStr = ` · moving ${degToDir(mv.direction)} ~${Math.round(mv.speed)} mph`;
  const lead = count > 1 ? `${count} storm cells inbound — strongest ` : 'Storm cell inbound — ';
  return `${lead}${best.dbz} dBZ at ${distStr}${best.impactPct > 0 ? ` · ${best.impactPct}% impact` : ''}${etaStr}${moveStr}`;
}

async function run() {
  if (!WORKER_URL) fail('WORKER_URL not set');
  if (!SCANNER_SECRET) fail('SCANNER_SECRET not set');
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) fail('VAPID keys not set');
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const subs = await getSubscribers();
  console.log(`Subscribers: ${subs.length}`);
  if (!subs.length) return;

  // Group by coarse location (~0.7 mi) so co-located devices share one scan.
  const groups = new Map();
  for (const s of subs) {
    const key = `${s.lat.toFixed(2)},${s.lon.toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  console.log(`Scan groups: ${groups.size}`);

  const now = Date.now();
  let sent = 0;

  for (const [key, members] of groups) {
    const radius = Math.min(80, Math.max(...members.map(m => thresholdsFor(m).radius)));
    const o = members[0];
    let scan;
    try {
      scan = await scanLocation(o.lat, o.lon, radius);
    } catch (e) { console.warn(`scan ${key} failed: ${e.message}`); continue; }
    const { cells, mv, source } = scan;
    console.log(`[${key}] ${source}: ${cells.length} cells (raw ${scan.rawCount || 0}), steering ${mv ? mv.speed + 'mph@' + mv.direction : 'n/a'}`);
    if (!cells.length) continue;

    for (const sub of members) {
      const th = thresholdsFor(sub);
      // Recompute geometry relative to THIS subscriber's exact location.
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
      if (!hits.length) continue;

      // Dedupe per cell key (same scheme the app uses).
      const lastAlert = { ...(sub.lastAlert || {}) };
      Object.keys(lastAlert).forEach(k => { if (now - lastAlert[k] > PRUNE_MS) delete lastAlert[k]; });
      const fresh = hits.filter(c => {
        const ck = `sc_${Math.round(c.bearing / 10)}_${Math.round(c.distance / 3)}`;
        c._ck = ck;
        return now - (lastAlert[ck] || 0) >= COOLDOWN_MS;
      });
      if (!fresh.length) continue;

      const best = fresh.slice().sort((a, b) => (b.impactPct - a.impactPct) || (b.dbz - a.dbz))[0];
      const payload = JSON.stringify({
        title: '🌩️ StormTracker Alert',
        body: fmtBody(best, fresh.length, mv),
        tag: 'storm-cell-alert',
        url: SITE_URL,
      });

      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 1800, urgency: 'high' });
        sent++;
        console.log(`  ✓ ${sub.name || key}: ${fmtBody(best, fresh.length, mv)}`);
        fresh.forEach(c => { lastAlert[c._ck] = now; });
        await markAlert(sub.endpoint, lastAlert);
      } catch (e) {
        const code = e.statusCode || e.status;
        console.warn(`  ✗ push failed (${code || e.message})`);
        if (code === 404 || code === 410) await pruneDead(sub.endpoint);
      }
    }
  }
  console.log(`Done. Notifications sent: ${sent}`);
}

run().catch(e => fail(e.stack || e.message));
