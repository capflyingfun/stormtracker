const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const SESSION_TTL_DAYS = 30;
const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW_MIN = 15;
const loginAttempts = new Map();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

const PBKDF2_ITERATIONS = 100000;

function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

async function hashPin(pin, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const hashHex = Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, '0')).join('');
  return salt + '$' + hashHex;
}

async function verifyPin(pin, stored) {
  const idx = stored.indexOf('$');
  if (idx === -1) return false;
  const salt = stored.substring(0, idx);
  const rehash = await hashPin(pin, salt);
  return rehash === stored;
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function checkLoginRate(ip) {
  const now = Date.now();
  const windowMs = LOGIN_RATE_WINDOW_MIN * 60 * 1000;
  const key = ip || 'unknown';
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.start > windowMs) {
    loginAttempts.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > LOGIN_RATE_LIMIT) return false;
  return true;
}

async function getUser(db, token) {
  if (!token) return null;
  const t = token.replace('Bearer ', '');
  const row = await db.prepare(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.token = ? AND s.created_at > datetime('now', '-${SESSION_TTL_DAYS} days')`
  ).bind(t).first();
  return row || null;
}

function canonicalLocKey(loc) {
  if (loc.name && loc.name.trim()) return loc.name.trim();
  return `${Number(loc.lat).toFixed(4)},${Number(loc.lon).toFixed(4)}`;
}

async function handleSignup(req, db) {
  let body;
  try { body = await req.json(); } catch { return err('Invalid JSON'); }
  const { email, pin } = body;
  if (!email || !pin) return err('Email and PIN are required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('Invalid email format');
  const pinStr = String(pin);
  if (!/^\d{4,6}$/.test(pinStr)) return err('PIN must be 4-6 digits');

  const normalEmail = email.toLowerCase().trim();
  const salt = generateSalt();
  const pinHash = await hashPin(pinStr, salt);

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(normalEmail).first();
  let userId;
  if (existing) {
    await db.batch([
      db.prepare('DELETE FROM alert_log WHERE user_id = ?').bind(existing.id),
      db.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(existing.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(existing.id),
      db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').bind(pinHash, existing.id),
    ]);
    userId = existing.id;
  } else {
    const result = await db.prepare(
      'INSERT INTO users (email, pin_hash) VALUES (?, ?)'
    ).bind(normalEmail, pinHash).run();
    userId = result.meta.last_row_id;
  }

  const token = generateToken();
  await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, userId).run();
  await db.prepare(
    `INSERT INTO user_settings (user_id, settings_json) VALUES (?, '{}') ON CONFLICT(user_id) DO NOTHING`
  ).bind(userId).run();

  return json({ token, email: normalEmail }, 201);
}

async function handleLogin(req, db) {
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || '';
  if (!checkLoginRate(ip)) return err('Too many login attempts. Try again in 15 minutes.', 429);

  let body;
  try { body = await req.json(); } catch { return err('Invalid JSON'); }
  const { email, pin } = body;
  if (!email || !pin) return err('Email and PIN are required');

  const normalEmail = email.toLowerCase().trim();
  const user = await db.prepare(
    'SELECT id, email, pin_hash FROM users WHERE email = ?'
  ).bind(normalEmail).first();

  if (!user) return err('Invalid email or PIN', 401);

  const valid = await verifyPin(String(pin), user.pin_hash);
  if (!valid) return err('Invalid email or PIN', 401);

  const token = generateToken();
  await db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, user.id).run();

  return json({ token, email: user.email });
}

async function handleLogout(req, db) {
  const auth = req.headers.get('Authorization');
  if (!auth) return err('Not authenticated', 401);
  const token = auth.replace('Bearer ', '');
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return json({ ok: true });
}

async function handleGetSettings(req, db) {
  const user = await getUser(db, req.headers.get('Authorization'));
  if (!user) return err('Not authenticated', 401);

  const row = await db.prepare('SELECT settings_json, updated_at FROM user_settings WHERE user_id = ?').bind(user.id).first();
  return json({
    settings: row ? JSON.parse(row.settings_json) : {},
    updated_at: row ? row.updated_at : null,
    email: user.email,
  });
}

async function handleSyncSettings(req, db) {
  const user = await getUser(db, req.headers.get('Authorization'));
  if (!user) return err('Not authenticated', 401);

  let body;
  try { body = await req.json(); } catch { return err('Invalid JSON'); }
  const { settings } = body;
  if (!settings || typeof settings !== 'object') return err('Settings object is required');

  const settingsStr = JSON.stringify(settings);
  if (settingsStr.length > 65536) return err('Settings too large (max 64KB)');

  await db.prepare(
    `INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at`
  ).bind(user.id, settingsStr).run();

  return json({ ok: true, updated_at: new Date().toISOString() });
}

async function handleDeleteAccount(req, db) {
  const user = await getUser(db, req.headers.get('Authorization'));
  if (!user) return err('Not authenticated', 401);

  await db.batch([
    db.prepare('DELETE FROM alert_log WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);

  return json({ ok: true });
}

async function fetchWeatherForLocation(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation,weather_code&timezone=auto`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.current || null;
  } catch {
    return null;
  }
}

function convertThresholdToMetric(key, val, units) {
  const tempUnit = (units && units.t) || 0;
  const windUnit = (units && units.w) || 0;
  const precipUnit = (units && units.pr) || 0;

  if (key === 'tempHigh' || key === 'tempLow') {
    return tempUnit === 0 ? (val - 32) * 5 / 9 : val;
  }
  if (key === 'windMax' || key === 'gustMax') {
    if (windUnit === 0) return val * 1.609;
    if (windUnit === 1) return val * 1.852;
    if (windUnit === 2) return val;
    return val * 3.6;
  }
  if (key === 'rainMax') {
    if (precipUnit === 0) return val * 25.4;
    if (precipUnit === 2) return val * 10;
    return val;
  }
  return val;
}

function evaluateThresholds(weather, thresholds, units) {
  const alerts = [];
  if (!weather || !thresholds) return alerts;

  const checks = [
    { key: 'windMax', field: 'wind_speed_10m', label: 'Wind Speed', unit: 'km/h', dir: 'above' },
    { key: 'gustMax', field: 'wind_gusts_10m', label: 'Wind Gusts', unit: 'km/h', dir: 'above' },
    { key: 'tempHigh', field: 'temperature_2m', label: 'Temperature', unit: '°C', dir: 'above' },
    { key: 'tempLow', field: 'temperature_2m', label: 'Temperature', unit: '°C', dir: 'below' },
    { key: 'rainMax', field: 'precipitation', label: 'Rainfall', unit: 'mm/hr', dir: 'above' },
    { key: 'humidHigh', field: 'relative_humidity_2m', label: 'Humidity', unit: '%', dir: 'above' },
    { key: 'humidLow', field: 'relative_humidity_2m', label: 'Humidity', unit: '%', dir: 'below' },
  ];

  for (const check of checks) {
    const cfg = thresholds[check.key];
    if (!cfg || !cfg.on) continue;
    const val = weather[check.field];
    if (val == null) continue;

    const metricThreshold = convertThresholdToMetric(check.key, cfg.val, units);
    const exceeded = check.dir === 'below' ? val <= metricThreshold : val >= metricThreshold;
    if (exceeded) {
      alerts.push({
        type: check.key,
        label: check.label,
        value: val,
        threshold: metricThreshold,
        unit: check.unit,
        direction: check.dir,
      });
    }
  }
  return alerts;
}

async function sendAlertEmail(env, to, locationName, alerts, appUrl) {
  const alertRows = alerts.map(a => {
    const dir = a.direction === 'below' ? 'dropped to' : 'reached';
    return `<tr><td style="padding:8px 12px;border-bottom:1px solid #1a2340;color:#8899bb">${a.label}</td><td style="padding:8px 12px;border-bottom:1px solid #1a2340;color:#ff6b6b;font-weight:600">${a.value} ${a.unit}</td><td style="padding:8px 12px;border-bottom:1px solid #1a2340;color:#8899bb">${dir} threshold of ${a.threshold} ${a.unit}</td></tr>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a1020;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#0d1530,#1a2545);border:1px solid #1a2a50;border-radius:12px;padding:24px;margin-bottom:16px">
    <div style="font-size:24px;font-weight:700;color:#00e5ff;margin-bottom:4px">⚡ StormTracker Alert</div>
    <div style="font-size:14px;color:#6688aa">Weather threshold exceeded</div>
  </div>
  <div style="background:#0d1530;border:1px solid #1a2a50;border-radius:12px;padding:20px;margin-bottom:16px">
    <div style="font-size:13px;color:#6688aa;margin-bottom:4px">LOCATION</div>
    <div style="font-size:18px;font-weight:600;color:#e0e8f0;margin-bottom:16px">📍 ${locationName}</div>
    <table style="width:100%;border-collapse:collapse">
      <tr><th style="padding:8px 12px;text-align:left;font-size:12px;color:#4488aa;border-bottom:1px solid #1a2340;text-transform:uppercase">Metric</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#4488aa;border-bottom:1px solid #1a2340;text-transform:uppercase">Current</th><th style="padding:8px 12px;text-align:left;font-size:12px;color:#4488aa;border-bottom:1px solid #1a2340;text-transform:uppercase">Status</th></tr>
      ${alertRows}
    </table>
  </div>
  <div style="text-align:center;margin-bottom:16px">
    <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#00c8ff,#0088cc);color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none">Open StormTracker →</a>
  </div>
  <div style="text-align:center;font-size:11px;color:#445566">
    <p>You're receiving this because you enabled email alerts in StormTracker.</p>
    <p>To stop alerts, log in to the app and toggle off email alerts.</p>
  </div>
</div>
</body>
</html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'StormTracker <alerts@' + (env.RESEND_DOMAIN || 'stormtracker.dev') + '>',
        to: [to],
        subject: `⚡ Weather Alert: ${alerts.map(a => a.label).join(', ')} — ${locationName}`,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function handleCron(env) {
  const db = env.DB;

  const users = await db.prepare(
    'SELECT u.id, u.email, us.settings_json FROM users u JOIN user_settings us ON u.id = us.user_id'
  ).all();

  if (!users.results || users.results.length === 0) return;

  for (const user of users.results) {
    let settings;
    try { settings = JSON.parse(user.settings_json); } catch { continue; }

    if (!settings.emailAlerts) continue;

    const favorites = settings.favorites || [];
    if (favorites.length === 0) continue;
    const wxThresholds = settings.wxThresholds || {};

    const hasActiveThreshold = Object.values(wxThresholds).some(t => t && t.on);
    if (!hasActiveThreshold) continue;

    for (const loc of favorites) {
      if (loc.lat == null || loc.lon == null) continue;
      if (loc.emailAlerts === false) continue;

      const locKey = canonicalLocKey(loc);

      const weather = await fetchWeatherForLocation(loc.lat, loc.lon);
      if (!weather) continue;

      const triggered = evaluateThresholds(weather, wxThresholds, settings.units);
      if (triggered.length === 0) continue;

      const recentAlerts = await db.prepare(
        "SELECT alert_type, sent_at FROM alert_log WHERE user_id = ? AND location_name = ? AND sent_at > datetime('now', '-15 minutes')"
      ).bind(user.id, locKey).all();

      const recentTypes = new Set((recentAlerts.results || []).map(r => r.alert_type));
      const newAlerts = triggered.filter(a => !recentTypes.has(a.type));
      if (newAlerts.length === 0) continue;

      const sent = await sendAlertEmail(env, user.email, locKey, newAlerts, env.APP_URL || 'https://your-site.github.io/StormTracker/');

      if (sent) {
        const batch = newAlerts.map(a =>
          db.prepare('INSERT INTO alert_log (user_id, alert_type, location_name, message) VALUES (?, ?, ?, ?)')
            .bind(user.id, a.type, locKey, `${a.label}: ${a.value} ${a.unit}`)
        );
        await db.batch(batch);
      }
    }
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.DB;

    try {
      if (path === '/api/signup' && request.method === 'POST') return await handleSignup(request, db);
      if (path === '/api/login' && request.method === 'POST') return await handleLogin(request, db);
      if (path === '/api/logout' && request.method === 'POST') return await handleLogout(request, db);
      if (path === '/api/settings' && request.method === 'GET') return await handleGetSettings(request, db);
      if (path === '/api/settings/sync' && request.method === 'POST') return await handleSyncSettings(request, db);
      if (path === '/api/account' && request.method === 'DELETE') return await handleDeleteAccount(request, db);
      if (path === '/api/health') return json({ status: 'ok', time: new Date().toISOString() });

      return err('Not found', 404);
    } catch (e) {
      console.error('Worker error:', e);
      return err('Internal server error', 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleCron(env));
  },
};
