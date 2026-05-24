// Version: v4.13 (display) | cache-bust counter: 509 (used in ?v= query strings and SW cache name)
const CACHE_NAME = 'stormtracker-v509';
const STATIC_ASSETS = [
  '/StormTracker/',
  '/StormTracker/index.html',
  '/StormTracker/offline.html',
  '/StormTracker/manifest.json',
  '/StormTracker/icons/icon-192x192.png',
  '/StormTracker/icons/icon-512x512.png',
  '/StormTracker/js/core.js',
  '/StormTracker/js/gauges.js',
  '/StormTracker/js/icons.js',
  '/StormTracker/js/geo.js',
  '/StormTracker/js/settings.js',
  '/StormTracker/js/thresholds.js',
  '/StormTracker/js/weather.js',
  '/StormTracker/js/radar.js',
  '/StormTracker/js/storms.js',
  '/StormTracker/js/station.js',
  '/StormTracker/js/alerts.js',
  '/StormTracker/js/ai.js',
  '/StormTracker/js/init.js',
  '/StormTracker/js/view3d.js',
  '/StormTracker/css/style.css',
  '/StormTracker/img/radar/scan-home.svg',
  '/StormTracker/img/radar/scan-view.svg',
  '/StormTracker/img/radar/scan-hires.svg',
  '/StormTracker/img/radar/source.svg',
  '/StormTracker/img/radar/source-nex.svg',
  '/StormTracker/img/radar/source-rv.svg',
  '/StormTracker/img/radar/units.svg',
  '/StormTracker/img/radar/units-km.svg',
  '/StormTracker/img/radar/airports.svg',
  '/StormTracker/img/radar/play.svg',
  '/StormTracker/img/radar/pause.svg',
  '/StormTracker/img/radar/stop.svg',
  '/StormTracker/img/radar/anim-loading.svg',
  '/StormTracker/img/radar/zones.svg',
  '/StormTracker/img/radar/path-arrows.svg',
  '/StormTracker/img/radar/points.svg',
  '/StormTracker/img/radar/points-12.svg',
  '/StormTracker/img/radar/tracks.svg',
  '/StormTracker/img/radar/tracks-12.svg',
  '/StormTracker/img/radar/radar-overlay.svg',
  '/StormTracker/img/radar/mping.svg',
  '/StormTracker/img/radar/alert-polys.svg',
  '/StormTracker/img/radar/hurricane.svg',
  '/StormTracker/img/radar/clear.svg',
  '/StormTracker/img/radar/terrain-3d.svg',
  '/StormTracker/img/radar/clutter.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.hostname.includes('workers.dev') || url.pathname.startsWith('/api/')) {
    return;
  }
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('/StormTracker/offline.html')))
    );
    return;
  }
  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'weather-sync') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_WEATHER' }));
      })
    );
  }
});

self.addEventListener('periodicsync', event => {
  if (event.tag === 'weather-update') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'PERIODIC_WEATHER_UPDATE' }));
      })
    );
  }
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'StormTracker Alert';
  const options = {
    body: data.body || 'Weather alert in your area',
    icon: '/StormTracker/icons/icon-192x192.png',
    badge: '/StormTracker/icons/icon-96x96.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'weather-alert',
    renotify: true,
    data: { url: data.url || '/StormTracker/' },
    actions: [
      { action: 'view', title: 'View Details' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'WX_THRESHOLD_ALERT') {
    const isStorm = (event.data.title || '').toLowerCase().includes('storm');
    self.registration.showNotification(event.data.title || 'StormTracker Alert', {
      body: event.data.body || 'Weather threshold breached',
      icon: '/StormTracker/icons/icon-192x192.png',
      badge: '/StormTracker/icons/icon-96x96.png',
      vibrate: isStorm ? [300, 100, 300, 100, 300] : [200, 100, 200],
      tag: isStorm ? 'storm-cell-alert' : 'wx-threshold',
      renotify: true,
      requireInteraction: isStorm,
      data: { url: '/StormTracker/' },
      actions: [
        { action: 'view', title: 'View Details' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    });
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/StormTracker/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const client of clients) {
        if (client.url.includes('/StormTracker/') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
