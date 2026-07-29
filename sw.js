self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Jern Yafoor School';

    // STRICT NO-BUTTONS POLICY: actions array must never be present
    const options = {
        body: data.body || 'New update available.',
        icon: 'jys_Icon.png',
        badge: 'jys_Icon.png',
        tag: data.tag || 'jys-default',
        renotify: true,
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/JYSLOGINPORTAL/index.html'
        }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/JYSLOGINPORTAL/index.html'));
});
