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
  async fetch(request, env) {
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

    if (path === '/subscriptions' && request.method === 'GET') {
      if (!env.SCANNER_SECRET || request.headers.get('x-scanner-secret') !== env.SCANNER_SECRET) {
        return json({ error: 'unauthorized' }, 401);
      }
      if (!env.DB) return json({ error: 'D1 not configured' }, 500);
      const { results } = await env.DB.prepare('SELECT * FROM subscriptions').all();
      const subscribers = (results || []).map(r => ({
        endpoint: r.endpoint,
        keys: { p256dh: r.p256dh, auth: r.auth },
        lat: r.lat, lon: r.lon, name: r.name,
        thresholds: safeParse(r.thresholds, {}),
        code: r.code,
        lastAlert: safeParse(r.last_alert, {}),
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
      if (b.delete) {
        // The scanner reports a dead/expired subscription (410/404) — prune it.
        await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?').bind(b.endpoint).run();
        return json({ ok: true, deleted: true });
      }
      await env.DB.prepare('UPDATE subscriptions SET last_alert = ? WHERE endpoint = ?')
        .bind(JSON.stringify(b.lastAlert || {}), b.endpoint).run();
      return json({ ok: true });
    }

    return new Response(
      'StormTracker Worker\n\nProxy:\n  /metar?ids=KPNS&format=raw\n  /taf?ids=KPNS&format=raw\n\nPush API:\n  POST /subscribe\n  POST /unsubscribe\n  GET  /subscriptions (scanner)\n  POST /mark-alert    (scanner)\n',
      { headers: { 'Content-Type': 'text/plain', ...CORS } }
    );
  },
};

function safeParse(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
