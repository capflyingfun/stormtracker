// Background Storm Push Alerts (Task #308)
// Opt-in Web Push so subscribers get notified when a storm is inbound even with
// the app/browser closed. The PWA stores the subscription on the dedicated
// Cloudflare Worker (PUSH_API_DEFAULT below — separate from the settings-sync
// server); a GitHub Actions cron scanner does the radar detection server-side
// and sends the pushes.

// Persistent VAPID public key (private half lives only in the scanner secrets).
const PUSH_VAPID_PUBLIC_KEY = 'BArKCxdh8nMmYi1LTdBQj-R_G0nDiBvbm5EvS4KIvcT5nUo45tiovDzkagdfG-1n2v_i0LGQz0VzUNBMfqlZG5Y';

// Deployed Cloudflare Worker that stores push subscriptions in D1. The push API
// (/subscribe, /unsubscribe) lives ONLY on this worker, so push always targets it
// — independent of the settings-sync server URL. Override with st_pushApiUrl.
const PUSH_API_DEFAULT = 'https://stormtracker-proxy.joshua-622.workers.dev';

function _pushApiUrl() {
  // Priority: explicit push override -> baked worker default. We deliberately do
  // NOT fall back to st_syncApiUrl: a stale/other sync URL there returns 404
  // ("Not found") for /subscribe, which previously blocked enabling alerts.
  try {
    const override = localStorage.getItem('st_pushApiUrl');
    if (override) return override.replace(/\/+$/, '');
    return PUSH_API_DEFAULT;
  } catch (e) { return PUSH_API_DEFAULT; }
}
function _getPushSub() { try { return JSON.parse(localStorage.getItem('st_pushSub') || 'null'); } catch (e) { return null; } }
function _setPushSub(v) { try { v ? localStorage.setItem('st_pushSub', JSON.stringify(v)) : localStorage.removeItem('st_pushSub'); } catch (e) {} }
function _getPushThresholds() {
  try { const s = JSON.parse(localStorage.getItem('st_pushThresholds') || 'null'); if (s) return s; } catch (e) {}
  return { dbz: 40, impact: 50, radius: 60, nws: true };
}
function _savePushThresholds(t) { try { localStorage.setItem('st_pushThresholds', JSON.stringify(t)); } catch (e) {} }

// The user's in-app weather threshold settings (Alerts tab) — sent with the
// subscription so the server-side scan evaluates them identically.
function _pushWxCfg() {
  try { const s = JSON.parse(localStorage.getItem('st_wxThresholds') || 'null'); return (s && typeof s === 'object') ? s : {}; }
  catch (e) { return {}; }
}
// Unit prefs travel too, so the scanner converts metric data into the same
// units the thresholds were set in.
function _pushUnits() {
  try { return { temp: S.tempUnit || 0, wind: S.windUnit || 0, pres: S.presUnit || 0, vis: S.visUnit || 0, precip: S.precipUnit || 0 }; }
  catch (e) { return { temp: 0, wind: 0, pres: 0, vis: 0, precip: 0 }; }
}

function _urlB64ToUint8(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function _pushLoc() {
  let home = null;
  try { home = (typeof getHomeLocation === 'function') ? getHomeLocation() : null; } catch (e) {}
  if (home && typeof home.lat === 'number') return { lat: home.lat, lon: home.lon, name: home.name || 'Home' };
  if (S && typeof S.lat === 'number') return { lat: S.lat, lon: S.lon, name: S.locName || 'Current location' };
  return null;
}

async function enablePushAlerts(silent) {
  const base = _pushApiUrl();
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { if (!silent) toast('⚠️ Push not supported on this device'); return; }
  const loc = _pushLoc();
  if (!loc) { if (!silent) toast('📍 Set a home location first'); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { if (!silent) toast('🔕 Notification permission denied'); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlB64ToUint8(PUSH_VAPID_PUBLIC_KEY),
      });
    }
    const th = _getPushThresholds();
    const existing = _getPushSub();
    const body = {
      subscription: sub.toJSON(),
      lat: loc.lat, lon: loc.lon, name: loc.name,
      thresholds: {
        dbz: th.dbz, impact: th.impact, dist: th.radius, radius: th.radius,
        wx: _pushWxCfg(), units: _pushUnits(), nws: th.nws !== false,
      },
      code: existing && existing.code ? existing.code : undefined,
    };
    const res = await fetch(base + '/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'subscribe failed');
    _setPushSub({ endpoint: sub.endpoint, code: data.code, lat: loc.lat, lon: loc.lon, name: loc.name });
    if (!silent) toast('🔔 Background storm alerts enabled');
  } catch (e) {
    console.log('[push] enable failed:', e.message);
    if (!silent) toast('⚠️ Could not enable alerts: ' + e.message);
  }
  syncSettingsUI();
}

async function disablePushAlerts() {
  const base = _pushApiUrl();
  const cur = _getPushSub();
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    if (base && (cur || sub)) {
      await fetch(base + '/unsubscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: (cur && cur.endpoint) || (sub && sub.endpoint) }),
        signal: AbortSignal.timeout(10000),
      });
    }
  } catch (e) { console.log('[push] disable:', e.message); }
  _setPushSub(null);
  toast('🔕 Background alerts disabled');
  syncSettingsUI();
}

function setPushThreshold(key, val) {
  const th = _getPushThresholds();
  th[key] = parseInt(val, 10);
  _savePushThresholds(th);
  // If already subscribed, push the new thresholds to the server.
  if (_getPushSub()) enablePushAlerts();
  else syncSettingsUI();
}

function setPushNws(on) {
  const th = _getPushThresholds();
  th.nws = !!on;
  _savePushThresholds(th);
  if (_getPushSub()) enablePushAlerts();
  else syncSettingsUI();
}

let _pushSyncTimer = null;
// Called from in-app Alerts/unit changes: silently re-push the subscription
// (debounced) so the background scanner always evaluates the user's CURRENT
// weather thresholds + unit prefs. No-op when not subscribed.
function syncPushAlerts() {
  try {
    if (!_getPushSub()) return;
    clearTimeout(_pushSyncTimer);
    _pushSyncTimer = setTimeout(() => { enablePushAlerts(true); }, 1500);
  } catch (e) {}
}

function renderPushAlertSettings() {
  const sub = _getPushSub();
  const th = _getPushThresholds();
  const loc = _pushLoc();
  const opt = (v, sel) => `<option value="${v}"${v === sel ? ' selected' : ''}>`;
  const on = !!sub;
  const statusBadge = `
    <div style="display:flex;align-items:center;gap:7px;font-weight:700;margin-bottom:6px;color:${on ? 'var(--accent-green)' : 'var(--text-muted)'}">
      <span style="width:10px;height:10px;border-radius:50%;flex:0 0 auto;background:${on ? 'var(--accent-green)' : 'var(--text-muted)'};${on ? 'box-shadow:0 0 7px var(--accent-green)' : ''}"></span>
      Background alerts ${on ? 'ON' : 'OFF'}
    </div>`;
  const controls = `
    <div class="setting-row-6"><span class="text-xxs-muted">Min strength (dBZ)</span>
      <select class="small-btn" onchange="setPushThreshold('dbz',this.value)">
        ${opt(30, th.dbz)}30</option>${opt(35, th.dbz)}35</option>${opt(40, th.dbz)}40</option>${opt(45, th.dbz)}45</option>${opt(50, th.dbz)}50</option>
      </select></div>
    <div class="setting-row-6"><span class="text-xxs-muted">Min impact</span>
      <select class="small-btn" onchange="setPushThreshold('impact',this.value)">
        ${opt(30, th.impact)}30%</option>${opt(50, th.impact)}50%</option>${opt(70, th.impact)}70%</option>
      </select></div>
    <div class="setting-row-6"><span class="text-xxs-muted">Watch radius</span>
      <select class="small-btn" onchange="setPushThreshold('radius',this.value)">
        ${opt(30, th.radius)}30 mi</option>${opt(50, th.radius)}50 mi</option>${opt(60, th.radius)}60 mi</option>${opt(80, th.radius)}80 mi</option>
      </select></div>
    <div class="setting-row-6"><span class="text-xxs-muted">NWS warnings</span>
      <button class="small-btn" onclick="setPushNws(${th.nws === false})" style="${th.nws !== false ? 'color:var(--accent-green);border-color:var(--accent-green)' : 'color:var(--text-muted)'}">${th.nws !== false ? 'ON' : 'OFF'}</button>
    </div>
    <div class="setting-hint" style="font-size:0.7em;margin-top:2px">Storm cells use the settings above. <b>NWS warnings</b> (hurricane, tornado, severe, flood, fire) push when active for your area. Weather alerts (wind, temp, rain, humidity, visibility…) mirror your <b>Alerts</b> tab — turn on the ones you want there and they'll push in the background too.</div>`;
  if (sub) {
    const moved = loc && (Math.abs(loc.lat - sub.lat) > 0.05 || Math.abs(loc.lon - sub.lon) > 0.05);
    return `
      ${statusBadge}
      <div class="setting-hint" style="color:var(--accent-green)">Watching <b>${escHtml(sub.name || 'your location')}</b>${moved ? ' <span style="color:var(--accent-yellow)">(location changed — tap Update)</span>' : ''}. You'll get a push when an inbound storm matches your thresholds, even with the app closed.</div>
      ${sub.code ? `<div class="setting-row-6"><span class="text-xxs-muted">Manage code</span><span style="font-family:var(--font-mono);font-weight:700;letter-spacing:1px;color:var(--accent-cyan)">${escHtml(sub.code)}</span></div>` : ''}
      ${controls}
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="small-btn" onclick="enablePushAlerts()" style="flex:1">↻ Update</button>
        <button class="small-btn" onclick="disablePushAlerts()" style="flex:1;color:var(--accent-red);border-color:var(--accent-red)">🔕 Turn off</button>
      </div>`;
  }
  return `
    ${statusBadge}
    <div class="setting-hint">Get a push notification when a storm is inbound — works even when StormTracker is closed. Scanned server-side every ~30 min for <b>${loc ? escHtml(loc.name) : 'your saved Home location'}</b>.</div>
    ${controls}
    <button class="small-btn" onclick="enablePushAlerts()" style="width:100%;margin-top:8px;color:var(--accent-green);border-color:var(--accent-green)">🔔 Turn on background alerts</button>`;
}
