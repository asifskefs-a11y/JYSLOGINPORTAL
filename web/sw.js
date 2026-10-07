const CACHE_NAME = 'jys-portal-v9.1-p2';
const ASSETS_TO_CACHE = [
    './',
    './admin.html',
    './admin_module.js',
    './asset_management.js',
    './attendance_module.js',
    './audit_module.js',
    './auth_client.js',
    './biometric_module.js',
    './contractor_module.js',
    './drive_module.js',
    './export_module.js',
    './fcm_module.js',
    './field_normalizer.js',
    './firebase_config.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './image_processor.js',
    './import_module.js',
    './index.html',
    './init_module.js',
    './jys_Icon.png',
    './manifest.json',
    './modules/staff_documents/docs_admin.js',
    './modules/staff_documents/docs_firebase.js',
    './modules/staff_documents/docs_ui.js',
    './modules/staff_documents/docs_verification.js',
    './schoollogo.png',
    './security.html',
    './staff-login.html',
    './staff-ui.css',
    './staff_asset_module.js',
    './style.css',
    './tasks_module.js',
    './ui_module.js',
    './visitor.html',
    './visitor_api.js',
    './visitor_module.js',
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

// Fetch Event
//  - App code (HTML / JS / CSS / JSON): NETWORK-FIRST, cache only as offline fallback.
//    (Stale-while-revalidate kept serving old, buggy JS for one extra reload after every release.)
//  - Everything else (fonts, icons, CDN libraries): stale-while-revalidate.
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (!req.url.startsWith('http') || req.method !== 'GET') return;

    const url = new URL(req.url);
    // Never intercept Firebase / Google APIs, auth handlers, analytics or Cloud Functions
    if (/firebaseio\.com|googleapis\.com\/(identitytoolkit|securetoken)|cloudfunctions\.net|run\.app|google-analytics|\/__\/auth\//.test(req.url)) return;

    const sameOrigin = url.origin === self.location.origin;
    const isAppCode = sameOrigin && (req.mode === 'navigate' || /\.(html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith('/'));

    if (isAppCode) {
        event.respondWith(
            fetch(req).then((res) => {
                if (res && res.status === 200) {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(req, copy));
                }
                return res;
            }).catch(() =>
                caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
            )
        );
        return;
    }

    event.respondWith(
        caches.match(req).then((cached) => {
            const network = fetch(req).then((res) => {
                if (res && (res.status === 200 || res.type === 'opaque')) {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(req, copy));
                }
                return res;
            }).catch(() => cached);
            return cached || network;
        })
    );
});
