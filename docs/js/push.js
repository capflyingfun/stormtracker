// Background Storm Push Alerts (Task #308)
// Opt-in Web Push so subscribers get notified when a storm is inbound even with
// the app/browser closed. The PWA stores the subscription on the dedicated
// Cloudflare Worker (PUSH_API_DEFAULT below — separate from the settings-sync
// server); a GitHub Actions cron scanner does the radar detection server-side
// and sends the pushes.

// Persistent VAPID public key (private half lives only in the scanner secrets).
const PUSH_VAPID_PUBLIC_KEY = 'BEZD0oSMhA2lWQAlaR0sRl8hsmaRL6ioKRxNDCPwHxcKMQuvYGJeUxbyIxsazG3O2OfIgXTAma4TZevHcAe7VM4';

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
// Tropical proximity radius mirrors the in-app NHC tracking setting so background
// tropical pushes use the same "within X mi / in the cone" rule as the live map.
function _pushTropRadius() {
  try { const v = parseInt(localStorage.getItem('st_nhc_prox_radius'), 10); return v > 0 ? v : 200; }
  catch (e) { return 200; }
}

function _urlB64ToUint8(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// True only if an existing PushSubscription was created with the SAME VAPID key
// we use now. After a key rotation a stale subscription keeps the old key and can
// never receive our pushes — so we must detect and replace it.
function _subKeyMatches(sub, wantBytes) {
  try {
    const cur = sub && sub.options && sub.options.applicationServerKey;
    if (!cur) return false;
    const a = new Uint8Array(cur);
    if (a.length !== wantBytes.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== wantBytes[i]) return false;
    return true;
  } catch (e) { return false; }
}

// Get a push subscription that is guaranteed to use the CURRENT VAPID key,
// re-subscribing if a stale-key subscription exists. Handles iOS throwing
// InvalidStateError when a subscription with a different key is still present.
async function _ensureFreshSubscription(reg) {
  const wantKey = _urlB64ToUint8(PUSH_VAPID_PUBLIC_KEY);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !_subKeyMatches(sub, wantKey)) {
    try { await sub.unsubscribe(); } catch (e) {}
    sub = null;
  }
  if (sub) return sub;
  try {
    return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wantKey });
  } catch (e) {
    // A subscription with a different key may still linger — drop it and retry once.
    const stale = await reg.pushManager.getSubscription();
    if (stale) { try { await stale.unsubscribe(); } catch (_) {} }
    return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wantKey });
  }
}

function _pushLoc() {
  let home = null;
  try { home = (typeof getHomeLocation === 'function') ? getHomeLocation() : null; } catch (e) {}
  if (home && typeof home.lat === 'number') return { lat: home.lat, lon: home.lon, name: home.name || 'Home' };
  if (S && typeof S.lat === 'number') return { lat: S.lat, lon: S.lon, name: S.locName || 'Current location' };
  return null;
}

// Full-screen "please wait" overlay with a live count-up timer, shown while a
// foreground enable/disable/update is in flight. A 45s safety timeout clears it
// and refreshes the panel if the operation stalls (e.g. permission prompt hangs).
let _pushBusyTimer = null, _pushBusySafety = null, _pushBusyStart = 0, _pushOpInFlight = false;
function _showPushBusy(label) {
  _hidePushBusy();
  _pushOpInFlight = true;
  _pushBusyStart = Date.now();
  let el = document.getElementById('pushBusyOverlay');
  if (!el) {
    if (!document.getElementById('pushBusyStyle')) {
      const s = document.createElement('style'); s.id = 'pushBusyStyle';
      s.textContent = '@keyframes pushBusySpin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
    el = document.createElement('div');
    el.id = 'pushBusyOverlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)';
    el.innerHTML = `
      <div style="background:var(--bg-card,#15171c);border:1px solid var(--border,#2a2d34);border-radius:14px;padding:22px 26px;max-width:280px;text-align:center;box-shadow:0 10px 34px rgba(0,0,0,0.55)">
        <div style="width:34px;height:34px;margin:0 auto 12px;border:3px solid var(--border,#2a2d34);border-top-color:var(--accent-green,#39d98a);border-radius:50%;animation:pushBusySpin 0.8s linear infinite"></div>
        <div id="pushBusyLabel" style="font-weight:700;color:var(--text,#e8eaed);font-size:0.95em;line-height:1.3">Updating…</div>
        <div id="pushBusyTimer" style="margin-top:7px;font-family:var(--font-mono,monospace);color:var(--text-muted,#9aa0a6);font-size:0.85em">0s</div>
      </div>`;
    document.body.appendChild(el);
  }
  el.querySelector('#pushBusyLabel').textContent = label || 'Updating your notification settings, please wait…';
  const timerEl = el.querySelector('#pushBusyTimer');
  el.style.display = 'flex';
  const tick = () => { timerEl.textContent = Math.floor((Date.now() - _pushBusyStart) / 1000) + 's'; };
  tick();
  _pushBusyTimer = setInterval(tick, 250);
  _pushBusySafety = setTimeout(() => {
    _hidePushBusy();
    try { syncSettingsPanel(); } catch (e) {}
    toast('⏱️ Still working… settings refreshed — please try again if needed.');
  }, 45000);
}
function _hidePushBusy() {
  _pushOpInFlight = false;
  if (_pushBusyTimer) { clearInterval(_pushBusyTimer); _pushBusyTimer = null; }
  if (_pushBusySafety) { clearTimeout(_pushBusySafety); _pushBusySafety = null; }
  const el = document.getElementById('pushBusyOverlay');
  if (el) el.style.display = 'none';
}

// POST to the push worker with a generous timeout and one automatic retry.
// Weak / handoff-prone LTE can make the first TLS connection to the worker exceed
// a tight timeout (Safari surfaces that as "Fetch is aborted"); a retry plus a
// longer budget makes enabling alerts reliable on mobile data.
async function _pushPost(url, body, { timeout = 20000, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      lastErr = e;
      const transient = e && (e.name === 'AbortError' || e.name === 'TypeError' || /abort|network|load failed/i.test(e.message || ''));
      if (attempt < retries && transient) continue;
      throw e;
    }
  }
  throw lastErr;
}

async function enablePushAlerts(silent) {
  const base = _pushApiUrl();
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { if (!silent) toast('⚠️ Push not supported on this device'); return; }
  const loc = _pushLoc();
  if (!loc) { if (!silent) toast('📍 Set a home location first'); return; }
  if (!silent) {
    if (_pushOpInFlight) return; // ignore double-clicks while one action is running
    _showPushBusy('Updating your notification settings, please wait…');
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { if (!silent) toast('🔕 Notification permission denied'); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await _ensureFreshSubscription(reg);
    const th = _getPushThresholds();
    const existing = _getPushSub();
    const body = {
      subscription: sub.toJSON(),
      lat: loc.lat, lon: loc.lon, name: loc.name,
      thresholds: {
        dbz: th.dbz, impact: th.impact, dist: th.radius, radius: th.radius,
        wx: _pushWxCfg(), units: _pushUnits(), nws: th.nws !== false,
        tropical: { on: th.tropical !== false, radius: _pushTropRadius() },
        tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; } })(),
        h24: (typeof _is24h === 'function') ? _is24h() : false,
      },
      code: existing && existing.code ? existing.code : undefined,
    };
    const res = await _pushPost(base + '/subscribe', body, { timeout: 20000, retries: 1 });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'subscribe failed');
    _setPushSub({ endpoint: sub.endpoint, code: data.code, lat: loc.lat, lon: loc.lon, name: loc.name });
    if (!silent) toast('🔔 Background storm alerts enabled');
  } catch (e) {
    console.log('[push] enable failed:', e.message);
    if (!silent) {
      const aborted = e && (e.name === 'AbortError' || /abort/i.test(e.message || ''));
      toast(aborted
        ? '⚠️ Couldn’t reach the alert server — connection too slow. Please try again, ideally on Wi-Fi.'
        : '⚠️ Could not enable alerts: ' + e.message);
    }
  } finally {
    if (!silent) _hidePushBusy();
    syncSettingsPanel();
  }
}

async function disablePushAlerts() {
  const base = _pushApiUrl();
  const cur = _getPushSub();
  if (_pushOpInFlight) return; // ignore double-clicks while one action is running
  _showPushBusy('Turning off notifications, please wait…');
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    if (base && (cur || sub)) {
      await _pushPost(base + '/unsubscribe', { endpoint: (sub && sub.endpoint) || (cur && cur.endpoint) }, { timeout: 15000, retries: 1 });
    }
  } catch (e) { console.log('[push] disable:', e.message); }
  finally { _hidePushBusy(); }
  _setPushSub(null);
  toast('🔕 Background alerts disabled');
  syncSettingsPanel();
}

function setPushThreshold(key, val) {
  const th = _getPushThresholds();
  th[key] = parseInt(val, 10);
  _savePushThresholds(th);
  // If already subscribed, push the new thresholds to the server.
  if (_getPushSub()) enablePushAlerts(true);
  else syncSettingsPanel();
}

function setPushNws(on) {
  const th = _getPushThresholds();
  th.nws = !!on;
  _savePushThresholds(th);
  if (_getPushSub()) enablePushAlerts(true);
  else syncSettingsPanel();
}

function setPushTropical(on) {
  const th = _getPushThresholds();
  th.tropical = !!on;
  _savePushThresholds(th);
  if (_getPushSub()) enablePushAlerts(true);
  else syncSettingsPanel();
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
    <div class="setting-row-6"><span class="text-xxs-muted">Tropical systems</span>
      <button class="small-btn" onclick="setPushTropical(${th.tropical === false})" style="${th.tropical !== false ? 'color:var(--accent-green);border-color:var(--accent-green)' : 'color:var(--text-muted)'}">${th.tropical !== false ? 'ON' : 'OFF'}</button>
    </div>
    <div class="setting-hint" style="font-size:0.7em;margin-top:2px">Everything active is bundled into <b>one</b> notification each scan (~5 min). Storm cells use the settings above. <b>NWS warnings</b> (hurricane, tornado, severe, flood, fire) push when active for your area. <b>Tropical systems</b> push when a hurricane/storm comes within your tracking radius (${_pushTropRadius()} mi, set on the map) or your location enters its forecast cone. Weather alerts (wind, temp, rain, humidity, visibility…) mirror your <b>Alerts</b> tab — turn on the ones you want there.</div>`;
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
    <div class="setting-hint">Get a push notification when a storm is inbound — works even when StormTracker is closed. Scanned server-side every ~5 min for <b>${loc ? escHtml(loc.name) : 'your saved Home location'}</b>.</div>
    ${controls}
    <button class="small-btn" onclick="enablePushAlerts()" style="width:100%;margin-top:8px;color:var(--accent-green);border-color:var(--accent-green)">🔔 Turn on background alerts</button>`;
}
