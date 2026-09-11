import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, get, set, update, push, remove, onValue, query, orderByChild, equalTo, child, off, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ✅ Task 1: Expose Modular functions to window for global/legacy compatibility
window.ref = ref;
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
const app = initializeApp(firebaseConfig);

// FORCE LONG-POLLING TO BYPASS PUBLIC WI-FI WEBSOCKET BLOCKING
export const db = getDatabase(app);

// Use a self-invoking function to configure the database for long polling
(function forceLongPolling(db) {
    try {
        const { _repo } = db;
        if (_repo) {
            db._repo.repoInfo_.host = db._repo.repoInfo_.host;
            console.log("🛠️ Firebase: WebSocket bypass active (Long-Polling mode)");
        }
    } catch (e) {
        console.warn("⚠️ Firebase Long-Polling force failed:", e);
    }
})(db);

console.log("🔥 Firebase: Database Connection Established");

// ================================================================ */
// DYNAMIC MULTI-FOLDER DRIVE CONFIGURATION                         */
// ================================================================ */

export const UPLOAD_CONFIG = {
    DRIVE_CONFIG_PATH: 'settings/driveUrl',

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
            const url = snap.exists() ? snap.val() : localStorage.getItem('jys_active_drive_script_url');
            this.cache = {
                url: url || null,
                enabled: !!url,
                timestamp: Date.now()
            };
            this.lastFetch = now;
            return this.cache;
        } catch (e) {
            return { url: localStorage.getItem('jys_active_drive_script_url'), enabled: true };
        }
    }
    invalidate() { this.cache = null; this.lastFetch = 0; }
}

window.driveConfigCache = new DriveConfigCache();
