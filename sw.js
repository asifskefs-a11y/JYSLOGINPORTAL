const CACHE_NAME = 'jys-portal-v7.6';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './admin.html',
    './staff-login.html',
    './visitor.html',
    './style.css',
    './staff-ui.css',
    './image_processor.js',
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
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&display=swap'
];

// Install Event - Caching static assets with robust error handling
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('📦 PWA: Pre-caching static assets');

            // ✅ Fix: Cache assets individually to prevent one failure from blocking the whole app
            const cachePromises = ASSETS_TO_CACHE.map(async (url) => {
                try {
                    const requestOptions = url.startsWith('http') ? { mode: 'no-cors' } : {};
                    const response = await fetch(url, requestOptions);
                    if (response.ok || response.type === 'opaque') {
                        return cache.put(url, response);
                    }
                } catch (err) {
                    console.warn(`⚠️ PWA: Failed to pre-cache ${url}:`, err.message);
                }
            });

            return Promise.all(cachePromises);
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
            // Return cached version immediately if found
            if (cachedResponse) {
                // Background update cache if online
                if (navigator.onLine) {
                    fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                        }
                    }).catch(() => {});
                }
                return cachedResponse;
            }

            // Otherwise fetch from network
            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            });
        }).catch(() => {
            // Offline fallback for HTML pages
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        })
    );
});
