const CACHE_NAME = 'stormtracker-v228w';
const STATIC_ASSETS = [
  '/StormTracker/',
  '/StormTracker/index.html',
  '/StormTracker/offline.html',
  '/StormTracker/manifest.json',
  '/StormTracker/icons/icon-192x192.png',
  '/StormTracker/icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
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
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
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
