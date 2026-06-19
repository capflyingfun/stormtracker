// StormTracker Cloudflare Worker
//   1. AWC METAR/TAF proxy (CORS-friendly aviation weather)
//   2. Push-subscription API (D1-backed) for multi-user background storm alerts
//
// D1 binding:   env.DB           (see schema.sql / wrangler.toml)
// Secret:       env.SCANNER_SECRET  (shared with the GitHub Actions scanner)
//
// Public endpoints (called by the static PWA):
//   POST /subscribe     { subscription, lat, lon, name, thresholds, code? } -> { ok, code }
//   POST /unsubscribe   { endpoint }  OR  { code }                          -> { ok }
// Scanner endpoints (require header  x-scanner-secret: <SCANNER_SECRET>):
//   GET  /subscriptions                                                     -> { subscribers:[...] }
//   POST /mark-alert    { endpoint, lastAlert }                             -> { ok }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-scanner-secret',
  'Access-Control-Max-Age': '86400',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function genCode() {
  // Short, human-shareable, unambiguous alphabet.
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

// `code` is UNIQUE in the schema, so a colliding code would make the INSERT
// throw. Return a code that is guaranteed free (ignoring this endpoint's own
// row), regenerating on the rare collision.
async function uniqueCode(env, candidate, selfEndpoint) {
  const taken = async (c) => {
    const row = await env.DB.prepare('SELECT endpoint FROM subscriptions WHERE code = ?').bind(c).first();
    return row && row.endpoint !== selfEndpoint;
  };
  if (candidate && !(await taken(candidate))) return candidate;
  for (let i = 0; i < 8; i++) {
    const c = genCode();
    if (!(await taken(c))) return c;
  }
  return genCode() + Date.now().toString(36).slice(-3).toUpperCase();
}

// Reliable scan scheduler. GitHub Actions' own cron is best-effort and skips
// runs constantly, so the dependable cadence comes from THIS Worker's Cloudflare
// Cron Trigger (configured every 5 min). On each tick we just poke the existing
// GitHub Actions scanner via workflow_dispatch — the scan itself still runs there
// (it has the VAPID + scanner secrets). Needs the `GH_DISPATCH_TOKEN` secret
// (a GitHub token with repo/actions:write). The GitHub-side cron stays as a
// flaky backup; the per-alert cooldown + workflow concurrency make overlap safe.
async function triggerScan(env) {
  if (!env.GH_DISPATCH_TOKEN) { console.warn('GH_DISPATCH_TOKEN not set — skipping scan dispatch'); return; }
  const url = 'https://api.github.com/repos/CAPFlyingFun/StormTracker/actions/workflows/storm-scan.yml/dispatches';
  const opts = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GH_DISPATCH_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'stormtracker-cron',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main' }),
  };
  // Retry transient failures (network blip / 5xx / rate limit) so a single
  // hiccup doesn't silently drop a 5-min tick. A 4xx (bad token/ref) is fatal
  // and won't self-heal — log and bail rather than hammer the API.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, opts);
      if (r.status === 204) { console.log(`scan dispatched (attempt ${attempt})`); return; }
      const body = (await r.text()).slice(0, 200);
      if (r.status >= 400 && r.status < 500 && r.status !== 429) {
        console.warn(`scan dispatch fatal: HTTP ${r.status} ${body}`); return;
      }
      console.warn(`scan dispatch attempt ${attempt} failed: HTTP ${r.status} ${body}`);
    } catch (e) {
      console.warn(`scan dispatch attempt ${attempt} error: ${e.message}`);
    }
    if (attempt < 3) await new Promise(res => setTimeout(res, 1500 * attempt));
  }
  console.warn('scan dispatch gave up after 3 attempts');
}

async function proxyAWC(kind, url) {
  const params = new URLSearchParams(url.search);
  const awcUrl = `https://aviationweather.gov/api/data/${kind}?${params.toString()}`;
  try {
    const resp = await fetch(awcUrl, { headers: { 'User-Agent': 'StormTracker/1.0' } });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: {
        'Content-Type': resp.headers.get('Content-Type') || 'text/plain',
        'Cache-Control': 'public, max-age=60',
        ...CORS,
      },
    });
  } catch (e) {
    return new Response('Upstream error: ' + e.message, { status: 502, headers: CORS });
  }
}

export default {
  // Cloudflare Cron Trigger (every 5 min) — the reliable heartbeat that kicks
  // off each background storm scan. See triggerScan() above.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(triggerScan(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // ---- AWC proxy (unchanged) ----
    if (path === '/metar') return proxyAWC('metar', url);
    if (path === '/taf') return proxyAWC('taf', url);

    // ---- Push subscription API ----
    if (path === '/subscribe' && request.method === 'POST') {
      if (!env.DB) return json({ error: 'D1 not configured' }, 500);
      let b;
      try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const sub = b.subscription;
      if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
        return json({ error: 'invalid subscription' }, 400);
      }
      if (typeof b.lat !== 'number' || typeof b.lon !== 'number') {
        return json({ error: 'lat/lon required' }, 400);
      }
      const thresholds = JSON.stringify(b.thresholds || {});
      const name = (b.name || '').slice(0, 120);
      // Preserve an existing code/last_alert for this endpoint if present.
      let code = (b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      const existing = await env.DB.prepare('SELECT code FROM subscriptions WHERE endpoint = ?')
        .bind(sub.endpoint).first();
      if (existing && existing.code) code = existing.code;
      code = await uniqueCode(env, code, sub.endpoint);
      await env.DB.prepare(
        `INSERT INTO subscriptions (endpoint, p256dh, auth, lat, lon, name, thresholds, code, created)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET
           p256dh=excluded.p256dh, auth=excluded.auth, lat=excluded.lat, lon=excluded.lon,
           name=excluded.name, thresholds=excluded.thresholds`
      ).bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth, b.lat, b.lon, name, thresholds, code, Date.now())
       .run();
      return json({ ok: true, code });
    }

    if (path === '/unsubscribe' && request.method === 'POST') {
      if (!env.DB) return json({ error: 'D1 not configured' }, 500);
      let b;
      try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      if (b.endpoint) {
        await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?').bind(b.endpoint).run();
        return json({ ok: true });
      }
      if (b.code) {
        await env.DB.prepare('DELETE FROM subscriptions WHERE code = ?')
          .bind(String(b.code).toUpperCase()).run();
        return json({ ok: true });
      }
      return json({ error: 'endpoint or code required' }, 400);
    }

    // ---- One-shot test push ----
    // A user tapped "Send test notification" in Settings. We just FLAG the test
    // in D1 `meta` (private — never exposed publicly) and nudge the scanner; the
    // scanner delivers it through the SAME web-push pipeline as real alerts (so a
    // success genuinely proves end-to-end delivery) and then clears the flag.
    if (path === '/test' && request.method === 'POST') {
      if (!env.DB) return json({ error: 'D1 not configured' }, 500);
      let b;
      try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      // Endpoint only — the client always has its own. (No `code` lookup here, to
      // avoid an enumeration / spam-someone-else's-device vector.)
      const endpoint = b.endpoint || '';
      if (!endpoint) return json({ error: 'endpoint required' }, 400);
      const sub = await env.DB.prepare('SELECT endpoint FROM subscriptions WHERE endpoint = ?')
        .bind(endpoint).first();
      if (!sub) return json({ error: 'not subscribed' }, 404);
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)').run();
      const now = Date.now();
      // Per-endpoint cooldown: if a test is already pending (flagged in the last
      // 60s) it's still in flight — don't re-flag or re-dispatch. Stops tap-spam
      // (or a known endpoint) from hammering the scanner; the pending test still
      // gets delivered on the next scan, so the user loses nothing.
      const pendingRow = await env.DB.prepare('SELECT value FROM meta WHERE key = ?')
        .bind('test:' + endpoint).first();
      const pendingTs = pendingRow ? (Number(pendingRow.value) || 0) : 0;
      if (pendingTs && now - pendingTs < 60000) {
        return json({ ok: true, queued: true, throttled: true });
      }
      await env.DB.prepare(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).bind('test:' + endpoint, String(now)).run();
      // Global dispatch debounce: at most one scanner nudge per 45s no matter how
      // many distinct endpoints ask, so a botnet of subscriptions can't fan out
      // into a flood of GitHub workflow_dispatch calls. The flag is already set,
      // so the regular ~5-min scan still delivers anything we skip dispatching for.
      const dRow = await env.DB.prepare('SELECT value FROM meta WHERE key = ?')
        .bind('last_test_dispatch').first();
      const lastDispatch = dRow ? (Number(dRow.value) || 0) : 0;
      if (now - lastDispatch >= 45000) {
        await env.DB.prepare(
          "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).bind('last_test_dispatch', String(now)).run();
        ctx.waitUntil(triggerScan(env));
      }
      return json({ ok: true, queued: true });
    }

    if (path === '/subscriptions' && request.method === 'GET') {
      if (!env.SCANNER_SECRET || request.headers.get('x-scanner-secret') !== env.SCANNER_SECRET) {
        return json({ error: 'unauthorized' }, 401);
      }
      if (!env.DB) return json({ error: 'D1 not configured' }, 500);
      const { results } = await env.DB.prepare('SELECT * FROM subscriptions').all();
      // Pending one-shot test pushes (set by POST /test). Only honor recent ones
      // so a stale flag can never cause a surprise notification later.
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)').run();
      const tRows = await env.DB.prepare("SELECT key, value FROM meta WHERE key LIKE 'test:%'").all();
      const TEST_TTL = 15 * 60 * 1000;
      const nowT = Date.now();
      const tests = new Map();
      for (const r of (tRows.results || [])) {
        const ep = r.key.slice(5), ts = Number(r.value) || 0;
        if (ts && nowT - ts < TEST_TTL) tests.set(ep, ts);
      }
      const subscribers = (results || []).map(r => ({
        endpoint: r.endpoint,
        keys: { p256dh: r.p256dh, auth: r.auth },
        lat: r.lat, lon: r.lon, name: r.name,
        thresholds: safeParse(r.thresholds, {}),
        code: r.code,
        lastAlert: safeParse(r.last_alert, {}),
        testRequested: tests.get(r.endpoint) || 0,
      }));
      return json({ subscribers });
    }

    if (path === '/mark-alert' && request.method === 'POST') {
      if (!env.SCANNER_SECRET || request.headers.get('x-scanner-secret') !== env.SCANNER_SECRET) {
        return json({ error: 'unauthorized' }, 401);
      }
      if (!env.DB) return json({ error: 'D1 not configured' }, 500);
      let b;
      try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      if (!b.endpoint) return json({ error: 'endpoint required' }, 400);
      if (b.clearTest) {
        // Scanner delivered (or pruned) a one-shot test — drop the flag so it
        // doesn't fire again.
        await env.DB.prepare('DELETE FROM meta WHERE key = ?').bind('test:' + b.endpoint).run();
        return json({ ok: true, testCleared: true });
      }
      if (b.delete) {
        // The scanner reports a dead/expired subscription (410/404) — prune it.
        await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?').bind(b.endpoint).run();
        return json({ ok: true, deleted: true });
      }
      await env.DB.prepare('UPDATE subscriptions SET last_alert = ? WHERE endpoint = ?')
        .bind(JSON.stringify(b.lastAlert || {}), b.endpoint).run();
      return json({ ok: true });
    }

    // Shared scheduler state for the randomized scan cadence. The scanner reads
    // the "next due" timestamp on each cron tick and writes the next one after
    // it scans. Guarded by the same scanner secret as /subscriptions.
    if (path === '/scan-due') {
      if (!env.SCANNER_SECRET || request.headers.get('x-scanner-secret') !== env.SCANNER_SECRET) {
        return json({ error: 'unauthorized' }, 401);
      }
      if (!env.DB) return json({ error: 'D1 not configured' }, 500);
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)').run();
      if (request.method === 'GET') {
        const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'scan_due'").first();
        return json({ due: row ? Number(row.value) || 0 : 0 });
      }
      if (request.method === 'POST') {
        let b;
        try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
        const due = Number(b.due) || 0;
        await env.DB.prepare(
          "INSERT INTO meta (key, value) VALUES ('scan_due', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).bind(String(due)).run();
        return json({ ok: true, due });
      }
      return json({ error: 'method not allowed' }, 405);
    }

    return new Response(
      'StormTracker Worker\n\nProxy:\n  /metar?ids=KPNS&format=raw\n  /taf?ids=KPNS&format=raw\n\nPush API:\n  POST /subscribe\n  POST /unsubscribe\n  GET  /subscriptions (scanner)\n  POST /mark-alert    (scanner)\n  GET/POST /scan-due  (scanner)\n',
      { headers: { 'Content-Type': 'text/plain', ...CORS } }
    );
  },
};

function safeParse(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
