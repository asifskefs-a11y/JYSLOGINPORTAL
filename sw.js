self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Jern Yafoor School';
    const options = {
        body: data.body || 'New update available.',
        icon: 'jys_Icon.png',
        badge: 'jys_Icon.png'
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/JYSLOGINPORTAL/index.html'));
});
