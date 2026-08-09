import { db } from './firebase_config.js';
import { ref, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

export async function registerPushNotifications(userId) {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        console.warn("Push notifications not supported.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const messaging = getMessaging();

            // Register Service Worker
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

            // Get Token
            const token = await getToken(messaging, {
                serviceWorkerRegistration: registration,
                vapidKey: "BOy3l7uW-c_L0r1Tq4uP29mY-8T9uDq5R_4J9qK1e4I0r5u1J4V8v1D5pA8m1M6I1o9B8O7k6V0L9s2N4P" // Placeholder VAPID Key
            });

            if (token) {
                await set(ref(db, `users/${userId}/fcmToken`), token);
                console.log("Native Push Token saved successfully:", token);
            }
        }
    } catch (error) {
        console.error("FCM Registration error:", error);
    }
}
