// JYS NATIVE WEB PUSH SERVICE WORKER & OFFLINE CACHE (v4.1)
const CACHE_NAME = 'jys-offline-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    'index.html',
    'admin.html',
    'staff.html',
    'visitor.html',
    'staff-login.html',
    'style.css',
    'staff-ui.css',
    'jys_Icon.png',
    'schoollogo.png',
    'manifest.json',
    'app.js',
    'init_module.js',
    'auth_module.js',
    'ui_module.js',
    'firebase_config.js',
    'field_normalizer.js',
    'attendance_module.js',
    'visitor_module.js',
    'drive_module.js',
    'tasks_module.js',
    'admin_module.js',
    'audit_module.js',
    'export_module.js',
    'import_module.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/html5-qrcode'
];

// INSTALL: Cache app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('👷 Service Worker: Caching App Shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// ACTIVATE: Cleanup old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        ))
    );
    self.clients.claim();
});

// FETCH: Cache-First, Network-Fallback strategy
// This bypasses SSL Inspection/Firewall issues by serving from local cache first
self.addEventListener('fetch', event => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then(networkResponse => {
                // Don't cache if not a successful response or external dynamic data
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(() => {
                // If network fails completely (e.g. guest Wi-Fi portal block)
                console.warn('⚠️ SW: Network failed, resource not in cache:', event.request.url);
            });
        })
    );
});

// JYS NATIVE WEB PUSH HANDLERS
self.addEventListener('push', event => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'School Alert', body: event.data.text() };
    }

    const title = data.title || 'Jern Yafoor School';

    // RICH PAYLOAD COMPATIBILITY (Android, iOS, Desktop)
    const options = {
        body: data.body || 'New update from the school portal.',
        icon: 'jys_Icon.png',
        badge: 'jys_Icon.png',
        image: data.image || null, // Rich media support for Asset Disposal
        tag: data.tag || 'jys-default',
        renotify: true,
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/JYSLOGINPORTAL/index.html'
        }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// NATIVE CLICK-TO-APP NAVIGATION
self.addEventListener('notificationclick', event => {
    const notification = event.notification;
    const urlToOpen = notification.data.url;

    notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Check if there is already a window tab open with the same URL
            for (let client of windowClients) {
                if (client.url.includes('/JYSLOGINPORTAL/') && 'focus' in client) {
                    return client.focus();
                }
            }
            // If no window is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
