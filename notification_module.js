import { db } from './firebase_config.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Native push trigger using Firebase Admin (simulated via client-side logic/backend trigger)
// In a real app, this should call your backend API/Firebase Cloud Function.
export async function sendNativePush(targetUserId, title, body) {
    console.log(`🚀 Triggering native push to ${targetUserId}: ${title}`);

    try {
        const snap = await get(ref(db, `users/${targetUserId}/fcmToken`));
        if (snap.exists()) {
            const token = snap.val();
            // This is where you would call a backend cloud function to push to the FCM API
            console.log("FCM Token found:", token, "- Triggering FCM API push...");
            // fetch('YOUR_BACKEND_FCM_PUSH_URL', { ... })
        }
    } catch (e) {
        console.error("Push delivery error:", e);
    }
}
