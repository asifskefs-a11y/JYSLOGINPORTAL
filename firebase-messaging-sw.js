importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBQJbAcwEZLQYLooRydSSgNRvzrXG5Vl24",
    projectId: "schoollog-f0a04",
    messagingSenderId: "961486864461",
    appId: "1:961486864461:web:62b8742704c55d287f5c04"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification.title || "School Operations Alert";
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/schoollogo.png',
        badge: '/schoollogo.png',
        data: payload.data || {}
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});
