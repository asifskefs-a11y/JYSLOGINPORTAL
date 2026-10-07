importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBQJbAcwEZLQYLooRydSSgNRvzrXG5Vl24",
    projectId: "schoollog-f0a04",
    messagingSenderId: "961486864461",
    appId: "1:961486864461:web:62b8742704c55d287f5c04"
});

const messaging = firebase.messaging();
// This worker lives in its own scope (see fcm_module.js) so it never fights sw.js / OneSignal.
const ROOT = new URL('../', self.registration.scope).href;

messaging.onBackgroundMessage((payload) => {
    const n = payload.notification || {};
    const d = payload.data || {};
    self.registration.showNotification(n.title || d.title || "School Operations Alert", {
        body: n.body || d.body || '',
        icon: ROOT + 'schoollogo.png',      // ✅ file that actually exists
        badge: ROOT + 'schoollogo.png',
        data: d
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        for (const c of list) { if ('focus' in c) return c.focus(); }
        return clients.openWindow(ROOT);
    }));
});
