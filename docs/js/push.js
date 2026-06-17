// Background Storm Push Alerts (Task #308)
// Opt-in Web Push so subscribers get notified when a storm is inbound even with
// the app/browser closed. The PWA only stores the subscription on the user's
// Cloudflare Worker (same base URL as the sync server); a GitHub Actions cron
// scanner does the radar detection server-side and sends the pushes.

// Persistent VAPID public key (private half lives only in the scanner secrets).
const PUSH_VAPID_PUBLIC_KEY = 'BArKCxdh8nMmYi1LTdBQj-R_G0nDiBvbm5EvS4KIvcT5nUo45tiovDzkagdfG-1n2v_i0LGQz0VzUNBMfqlZG5Y';

function _pushApiUrl() {
  // Reuse the sync server base URL (same Cloudflare Worker hosts both APIs).
  try { return (typeof _syncApiUrl === 'function' ? _syncApiUrl() : (localStorage.getItem('st_syncApiUrl') || '')); }
  catch (e) { return ''; }
}
function _getPushSub() { try { return JSON.parse(localStorage.getItem('st_pushSub') || 'null'); } catch (e) { return null; } }
function _setPushSub(v) { try { v ? localStorage.setItem('st_pushSub', JSON.stringify(v)) : localStorage.removeItem('st_pushSub'); } catch (e) {} }
function _getPushThresholds() {
  try { const s = JSON.parse(localStorage.getItem('st_pushThresholds') || 'null'); if (s) return s; } catch (e) {}
  return { dbz: 40, impact: 50, radius: 60 };
}
function _savePushThresholds(t) { try { localStorage.setItem('st_pushThresholds', JSON.stringify(t)); } catch (e) {} }

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

async function enablePushAlerts() {
  const base = _pushApiUrl();
  if (!base) { toast('⚠️ Set your sync server URL in Account first'); return; }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { toast('⚠️ Push not supported on this device'); return; }
  const loc = _pushLoc();
  if (!loc) { toast('📍 Set a home location first'); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('🔕 Notification permission denied'); return; }
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
      thresholds: { dbz: th.dbz, impact: th.impact, dist: th.radius, radius: th.radius },
      code: existing && existing.code ? existing.code : undefined,
    };
    const res = await fetch(base + '/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'subscribe failed');
    _setPushSub({ endpoint: sub.endpoint, code: data.code, lat: loc.lat, lon: loc.lon, name: loc.name });
    toast('🔔 Background storm alerts enabled');
  } catch (e) {
    console.log('[push] enable failed:', e.message);
    toast('⚠️ Could not enable alerts: ' + e.message);
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

function renderPushAlertSettings() {
  const base = _pushApiUrl();
  const sub = _getPushSub();
  const th = _getPushThresholds();
  const loc = _pushLoc();
  const opt = (v, sel) => `<option value="${v}"${v === sel ? ' selected' : ''}>`;
  if (!base) {
    return `<div class="setting-hint" style="color:var(--accent-yellow)">⚠️ Set your sync server URL in the Account section first — background alerts use the same server.</div>`;
  }
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
      </select></div>`;
  if (sub) {
    return `
      <div class="setting-hint" style="color:var(--accent-green)">✅ Enabled for <b>${escHtml(sub.name || 'your location')}</b>${loc && (Math.abs(loc.lat - sub.lat) > 0.05 || Math.abs(loc.lon - sub.lon) > 0.05) ? ' <span style="color:var(--accent-yellow)">(location changed — tap Update)</span>' : ''}. You'll get a push when an inbound storm matches your thresholds, even with the app closed.</div>
      ${sub.code ? `<div class="setting-row-6"><span class="text-xxs-muted">Manage code</span><span style="font-family:var(--font-mono);font-weight:700;letter-spacing:1px;color:var(--accent-cyan)">${escHtml(sub.code)}</span></div>` : ''}
      ${controls}
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="small-btn" onclick="enablePushAlerts()" style="flex:1">↻ Update</button>
        <button class="small-btn" onclick="disablePushAlerts()" style="flex:1;color:var(--accent-red)">🔕 Disable</button>
      </div>`;
  }
  return `
    <div class="setting-hint">Get a push notification when a storm is inbound — works even when StormTracker is closed. Scanned server-side every ~30 min.</div>
    ${controls}
    <button class="small-btn" onclick="enablePushAlerts()" style="width:100%;margin-top:8px;color:var(--accent-cyan)">🔔 Enable background alerts</button>`;
}
