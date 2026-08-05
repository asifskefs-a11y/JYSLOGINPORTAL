import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// ================================================================ */
// DYNAMIC MULTI-FOLDER DRIVE CONFIGURATION                         */
// ================================================================ */

export const UPLOAD_CONFIG = {
    DRIVE_CONFIG_PATH: 'system_config/drive_url',

    // MANDATORY ROUTING MAP
    CATEGORIES: {
        STAFF_ATTENDANCE: 'ATTENDANCE_STAFF',
        ASSET_TRANSFER_PHOTOS: 'ASSET_TRANSFER_PHOTOS',
        ASSET_TRANSFER_SIGNATURES: 'ASSET_TRANSFER_SIGNATURES',
        VISITORS: 'VISITORS',
        TASK_PHOTOS: 'TASK_PHOTOS',
        TASK_SIGNATURES: 'TASK_SIGNATURES',
        DISPOSAL: 'DISPOSAL'
    },

    DEFAULTS: {
        DRIVE_URL: "https://script.google.com/macros/s/AKfycbGqJah3auambryQdBDlohhYP4WkUvLgZOkiClPlUBx2EQRgDz7m3r_zZnsRkId8qnDlw/exec",
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
            const data = snap.exists() ? snap.val() : null;
            this.cache = {
                url: typeof data === 'string' ? data : (data?.url || UPLOAD_CONFIG.DEFAULTS.DRIVE_URL),
                enabled: data?.enabled !== false,
                timestamp: Date.now()
            };
            this.lastFetch = now;
            return this.cache;
        } catch (e) {
            return { url: UPLOAD_CONFIG.DEFAULTS.DRIVE_URL, enabled: true };
        }
    }
    invalidate() { this.cache = null; this.lastFetch = 0; }
}

window.driveConfigCache = new DriveConfigCache();
