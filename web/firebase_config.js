import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, serverTimestamp, ref, get, set, update, push, remove, onValue, query, orderByChild, equalTo, child, off, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ✅ Task 1: Expose Modular functions to window for global/legacy compatibility
window.ref = ref;
window.serverTimestamp = serverTimestamp;
window.get = get;
window.set = set;
window.update = update;
window.push = push;
window.remove = remove;
window.onValue = onValue;
window.child = child;
window.query = query;
window.off = off;

// ✅ Task 2: Provide a namespaced shim for legacy code
window.firebase = {
    database: () => ({
        ref: (path) => ({
            set: (data) => window.set(window.ref(db, path), data),
            update: (data) => window.update(window.ref(db, path), data),
            push: (data) => window.push(window.ref(db, path), data),
            once: (evt) => window.get(window.ref(db, path)),
            on: (evt, cb) => window.onValue(window.ref(db, path), cb)
        })
    })
};

const firebaseConfig = {
    apiKey: "AIzaSyBQJbAcwEZLQYLooRydSSgNRvzrXG5Vl24",
    authDomain: "schoollog-f0a04.firebaseapp.com",
    projectId: "schoollog-f0a04",
    storageBucket: "schoollog-f0a04.firebasestorage.app",
    messagingSenderId: "961486864461",
    appId: "1:961486864461:web:62b8742704c55d287f5c04",
    measurementId: "G-G7QEGJTBPE",
    databaseURL: "https://schoollog-f0a04-default-rtdb.firebaseio.com"
};

console.log("🔥 Firebase: Starting Initialization...");
export const app = initializeApp(firebaseConfig);

// ✅ AUTH FIRST: must be created BEFORE getDatabase() so every DB request
// automatically carries the signed-in user's token.
export const auth = getAuth(app);

/**
 * Resolves once Firebase has restored (or not) the previous session.
 * Visitor/landing pages get an anonymous session; staff/admin pages do not
 * (they must log in through the staffLogin Cloud Function).
 */
export const authReady = new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
        unsub();
        const staffPage = /(admin|staff-login|security|staff)\.html/.test(window.location.pathname);
        if (!user && !staffPage) {
            try { user = (await signInAnonymously(auth)).user; }
            catch (e) { console.warn('Anonymous sign-in failed:', e.code); }
        }
        let claims = {};
        if (user) { try { claims = (await user.getIdTokenResult()).claims; } catch (_) {} }
        window.authClaims = claims;
        window.isVerifiedAdmin = claims.admin === true;
        resolve({ user, claims });
    });
});
window.authReady = authReady;

// Initialize Realtime Database with explicit URL and debug mode
export const db = getDatabase(app, "https://schoollog-f0a04-default-rtdb.firebaseio.com");
window.db = db; // Expose for debugging

// Monitor Connection State
const connectedRef = ref(db, ".info/connected");
onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
        console.log("🔥 Firebase: Connection Established ✅");
    } else {
        console.warn("🔥 Firebase: Disconnected ❌");
    }
});

// (removed) test write to system/last_boot - it required public write access.

console.log("🔥 Firebase: Database instance ready");

// ================================================================ */
// DYNAMIC MULTI-FOLDER DRIVE CONFIGURATION                         */
// ================================================================ */

export const UPLOAD_CONFIG = {
    DRIVE_CONFIG_PATH: 'system/settings/drive', // ✅ same node drive_module.js uses (was a second, unused path)

    // MANDATORY ROUTING MAP
    CATEGORIES: {
        STAFF_ATTENDANCE: 'ATTENDANCE_STAFF',
        ASSET_TRANSFER_PHOTOS: 'ASSET_TRANSFER_PHOTOS',
        ASSET_TRANSFER_SIGNATURES: 'ASSET_TRANSFER_SIGNATURES',
        VISITORS: 'VISITORS',
        CONTRACTORS: 'CONTRACTORS',
        TASK_PHOTOS: 'TASK_PHOTOS',
        TASK_SIGNATURES: 'TASK_SIGNATURES',
        DISPOSAL: 'DISPOSAL',
        PROFILE_PHOTOS: 'PROFILE_PHOTOS'
    },

    DEFAULTS: {
        TIMEOUT: 30000,
        MAX_RETRIES: 3
    }
};

class DriveConfigCache {
    constructor() {
        this.cache = null;
        this.lastFetch = 0;
        this.cacheDuration = 300000; // 5 minutes
    }
    async getConfig(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && this.cache && (now - this.lastFetch) < this.cacheDuration) return this.cache;
        try {
            const snap = await get(ref(db, UPLOAD_CONFIG.DRIVE_CONFIG_PATH));
            const v = snap.exists() ? snap.val() : null;
            const url = (v && typeof v === 'object') ? v.webAppUrl : (v || localStorage.getItem('app_drive_script_url'));
            const enabled = !!url && !(v && typeof v === 'object' && v.isConnected === false);
            this.cache = {
                url: url || null,
                enabled,
                timestamp: Date.now()
            };
            this.lastFetch = now;
            return this.cache;
        } catch (e) {
            return { url: localStorage.getItem('app_drive_script_url'), enabled: true };
        }
    }
    invalidate() { this.cache = null; this.lastFetch = 0; }
}

window.driveConfigCache = new DriveConfigCache();
