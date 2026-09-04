const CACHE_NAME = 'jys-portal-v4.0';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './admin.html',
    './staff-login.html',
    './visitor.html',
    './style.css',
    './staff-ui.css',
    './schoollogo.png',
    './jys_Icon.png',
    './manifest.json',
    './firebase_config.js',
    './field_normalizer.js',
    './drive_module.js',
    './ui_module.js',
    './import_module.js',
    './export_module.js',
    './audit_module.js',
    './attendance_module.js',
    './tasks_module.js',
    './admin_module.js',
    './visitor_module.js',
    './init_module.js',
    './contractor_module.js',
    './staff_asset_module.js',
    './asset_management.js',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&display=swap'
];

// Install Event - Caching static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('📦 PWA: Pre-caching static assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate Event - Cleaning up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('🗑️ PWA: Clearing old cache', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch Event - Stale-while-revalidate strategy
self.addEventListener('fetch', (event) => {
    // 🛡️ PROTOCOL FILTER: Only handle HTTP/HTTPS. Skip chrome-extension, data, etc.
    if (!event.request.url.startsWith('http')) {
        return;
    }

    // Skip Firebase and non-GET requests
    if (event.request.url.includes('firebaseio.com') ||
        event.request.url.includes('google-analytics') ||
        event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                // Update cache with new response
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            });

            // Return cached response if available, else wait for network
            return cachedResponse || fetchPromise;
        }).catch(() => {
            // Offline fallback for HTML pages
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        })
    );
});
