// No pre-caching of HTML pages — Next.js handles its own caching.
// This SW only provides offline fallback for static assets (JS/CSS/images).

// Install — skip waiting to activate immediately on update
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate — wipe ALL old caches so stale HTML/CSS never persists
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

// Fetch — network only for navigation, network-first for static assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Never intercept API calls or page navigations
  if (event.request.url.includes('/api/') || event.request.mode === 'navigate') {
    return;
  }

  // Static assets (JS, CSS, images, fonts): network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open('become-static').then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
