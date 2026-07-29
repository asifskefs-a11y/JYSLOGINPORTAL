// JYS NATIVE WEB PUSH SERVICE WORKER
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
